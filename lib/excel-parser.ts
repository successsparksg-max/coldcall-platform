import * as XLSX from "xlsx";
import {
  normalizePhone,
  validatePolicyType,
  validatePreferredTime,
  validateLanguage,
} from "./validators";
import type { ValidationError } from "./types";

interface ParsedEntry {
  phoneNumber: string;
  contactName: string;
  company: string | null;
  policyType: string | null;
  preferredTime: string | null;
  language: string | null;
  notes: string | null;
  sortOrder: number;
}

interface ParseResult {
  success: boolean;
  entries: ParsedEntry[];
  errors: {
    file: string | null;
    headers: string | null;
    rows: ValidationError[];
  };
  warnings: { type: string; message: string }[];
  summary: { totalRows: number; validRows: number; errorRows: number };
}

// Field key mappings (from Row 2 of template)
const FIELD_KEYS: Record<string, string> = {
  phone_number: "phone_number",
  contact_name: "contact_name",
  company: "company",
  policy_type: "policy_type",
  preferred_time: "preferred_time",
  language: "language",
  notes: "notes",
};

// Fallback header mappings
const HEADER_ALIASES: Record<string, string> = {
  "phone number": "phone_number",
  "phone": "phone_number",
  "contact name": "contact_name",
  "name": "contact_name",
  "company": "company",
  "policy type": "policy_type",
  "preferred call time": "preferred_time",
  "preferred time": "preferred_time",
  "language": "language",
  "notes": "notes",
};

export function parseExcel(buffer: ArrayBuffer): ParseResult {
  const errors: {
    file: string | null;
    headers: string | null;
    rows: ValidationError[];
  } = { file: null, headers: null, rows: [] };
  const warnings: { type: string; message: string }[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    return {
      success: false,
      entries: [],
      errors: { ...errors, file: "Invalid file format. Upload .xlsx, .xls, or .csv" },
      warnings,
      summary: { totalRows: 0, validRows: 0, errorRows: 0 },
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      success: false,
      entries: [],
      errors: { ...errors, file: "No sheets found in workbook" },
      warnings,
      summary: { totalRows: 0, validRows: 0, errorRows: 0 },
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData: (string | number | null)[][] = XLSX.utils.sheet_to_json(
    sheet,
    { header: 1, defval: null }
  );

  if (rawData.length < 2) {
    return {
      success: false,
      entries: [],
      errors: { ...errors, headers: "File has no data rows" },
      warnings,
      summary: { totalRows: 0, validRows: 0, errorRows: 0 },
    };
  }

  // Try Row 2 (index 1) for field keys, fallback to Row 1 (index 0) for headers
  let columnMap: Record<string, number> = {};

  // Try field keys from row 2
  if (rawData.length >= 2 && rawData[1]) {
    const row2 = rawData[1].map((v) =>
      v ? String(v).trim().toLowerCase() : ""
    );
    for (let i = 0; i < row2.length; i++) {
      if (FIELD_KEYS[row2[i]]) {
        columnMap[row2[i]] = i;
      }
    }
  }

  // If no field keys found, try header row
  if (!columnMap["phone_number"]) {
    const row1 = rawData[0].map((v) =>
      v ? String(v).trim().toLowerCase() : ""
    );
    columnMap = {};
    for (let i = 0; i < row1.length; i++) {
      const alias = HEADER_ALIASES[row1[i]];
      if (alias) {
        columnMap[alias] = i;
      }
    }
  }

  // Validate required columns
  if (columnMap["phone_number"] === undefined) {
    return {
      success: false,
      entries: [],
      errors: {
        ...errors,
        headers: "Missing required column: Phone Number",
      },
      warnings,
      summary: { totalRows: 0, validRows: 0, errorRows: 0 },
    };
  }
  if (columnMap["contact_name"] === undefined) {
    return {
      success: false,
      entries: [],
      errors: {
        ...errors,
        headers: "Missing required column: Contact Name",
      },
      warnings,
      summary: { totalRows: 0, validRows: 0, errorRows: 0 },
    };
  }

  // Parse data rows (start from row 3 = index 2, skipping header and field key rows)
  const entries: ParsedEntry[] = [];
  const phonesSeen = new Set<string>();
  let startRow = 2;

  // Check if row 2 is actually a field key row or data
  const row2HasFieldKeys = Object.keys(columnMap).length > 0 &&
    rawData[1] &&
    rawData[1].some((v) => v && FIELD_KEYS[String(v).trim().toLowerCase()]);
  if (!row2HasFieldKeys) {
    startRow = 1;
  }

  for (let i = startRow; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;

    // Skip fully blank rows
    const hasData = row.some((v) => v !== null && v !== undefined && String(v).trim() !== "");
    if (!hasData) continue;

    const excelRow = i + 1; // 1-indexed for user display
    const rawPhone = row[columnMap["phone_number"]];
    const rawName = row[columnMap["contact_name"]];

    // Validate phone
    if (!rawPhone || String(rawPhone).trim() === "") {
      errors.rows.push({
        row: excelRow,
        field: "phone_number",
        message: "Phone number is required",
      });
      continue;
    }

    const phoneResult = normalizePhone(String(rawPhone));
    if (!phoneResult.normalized) {
      errors.rows.push({
        row: excelRow,
        field: "phone_number",
        message: phoneResult.error || "Invalid phone number",
      });
      continue;
    }

    // Validate name
    if (!rawName || String(rawName).trim() === "") {
      errors.rows.push({
        row: excelRow,
        field: "contact_name",
        message: "Contact name is required",
      });
      continue;
    }

    // Check duplicates
    if (phonesSeen.has(phoneResult.normalized)) {
      warnings.push({
        type: "duplicate",
        message: `Row ${excelRow}: Duplicate phone number ${phoneResult.normalized}`,
      });
    }
    phonesSeen.add(phoneResult.normalized);

    // Optional fields
    const getCellStr = (key: string): string | null => {
      const idx = columnMap[key];
      if (idx === undefined) return null;
      const v = row[idx];
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s || null;
    };

    const policyType = validatePolicyType(getCellStr("policy_type"));
    const preferredTime = validatePreferredTime(getCellStr("preferred_time"));
    const language = validateLanguage(getCellStr("language"));

    entries.push({
      phoneNumber: phoneResult.normalized,
      contactName: String(rawName).trim(),
      company: getCellStr("company"),
      policyType,
      preferredTime,
      language,
      notes: getCellStr("notes"),
      sortOrder: entries.length,
    });
  }

  // List-level checks
  if (entries.length === 0 && errors.rows.length === 0) {
    return {
      success: false,
      entries: [],
      errors: { ...errors, file: "No valid data rows found" },
      warnings,
      summary: { totalRows: 0, validRows: 0, errorRows: 0 },
    };
  }

  if (entries.length > 1000) {
    return {
      success: false,
      entries: [],
      errors: {
        ...errors,
        file: "Maximum 1,000 contacts per upload",
      },
      warnings,
      summary: {
        totalRows: entries.length + errors.rows.length,
        validRows: entries.length,
        errorRows: errors.rows.length,
      },
    };
  }

  const success = entries.length > 0;

  return {
    success,
    entries: success ? entries : [],
    errors,
    warnings,
    summary: {
      totalRows: entries.length + errors.rows.length,
      validRows: entries.length,
      errorRows: errors.rows.length,
    },
  };
}
