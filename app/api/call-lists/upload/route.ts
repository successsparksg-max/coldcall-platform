import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists, callEntries, uploadValidations } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiError } from "@/lib/api-helpers";
import { parseExcel } from "@/lib/excel-parser";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("agent", "admin");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return apiError("No file uploaded", 400);
    }

    // File type check — accept .xlsx, .xls, .csv (Google Sheets exports)
    const allowedExtensions = [".xlsx", ".xls", ".csv"];
    const hasValidExt = allowedExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );
    if (!hasValidExt) {
      return apiError("Only .xlsx, .xls, and .csv files are accepted", 422);
    }

    // Size check
    if (file.size > MAX_FILE_SIZE) {
      return apiError("File size exceeds 10MB limit", 422);
    }

    const buffer = await file.arrayBuffer();
    const fileHash = crypto
      .createHash("sha256")
      .update(Buffer.from(buffer))
      .digest("hex");

    const result = parseExcel(buffer);

    // Store validation record
    await db.insert(uploadValidations).values({
      agentId: user.id,
      originalFilename: file.name,
      fileHash,
      totalRows: result.summary.totalRows,
      validRows: result.summary.validRows,
      errorRows: result.summary.errorRows,
      errors: result.errors as unknown as Record<string, unknown>,
      warnings: result.warnings as unknown as Record<string, unknown>[],
      validationPassed: result.success,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          errors: result.errors,
          summary: result.summary,
        },
        { status: 422 }
      );
    }

    // Create call list
    const [callList] = await db
      .insert(callLists)
      .values({
        agentId: user.id,
        originalFilename: file.name,
        fileHash,
        parseStatus: "parsed",
        callStatus: "ready",
        totalNumbers: result.entries.length,
      })
      .returning();

    // Create call entries
    if (result.entries.length > 0) {
      await db.insert(callEntries).values(
        result.entries.map((entry) => ({
          callListId: callList.id,
          phoneNumber: entry.phoneNumber,
          contactName: entry.contactName,
          company: entry.company,
          policyType: entry.policyType,
          preferredTime: entry.preferredTime,
          language: entry.language,
          notes: entry.notes,
          sortOrder: entry.sortOrder,
        }))
      );
    }

    // Update validation record with call list ID (best-effort)
    await db
      .update(uploadValidations)
      .set({ callListId: callList.id })
      .where(eq(uploadValidations.agentId, user.id))
      .catch(() => {});

    return NextResponse.json(
      {
        success: true,
        callListId: callList.id,
        totalEntries: result.entries.length,
        warnings: result.warnings,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
