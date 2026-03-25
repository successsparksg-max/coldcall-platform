import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callLists, callEntries, uploadValidations } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiError } from "@/lib/api-helpers";
import { parseExcel } from "@/lib/excel-parser";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { z } from "zod/v4";

const importSchema = z.object({
  url: z.string().min(1),
  botCredentialId: z.string().optional(),
});

/**
 * Extract the Google Sheet ID from various URL formats:
 * - https://docs.google.com/spreadsheets/d/SHEET_ID/edit
 * - https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=0
 * - https://docs.google.com/spreadsheets/d/SHEET_ID
 */
function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("agent", "admin");

    const body = await req.json();
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid input", 422);
    }

    const { url, botCredentialId } = parsed.data;

    const sheetId = extractSheetId(url);
    if (!sheetId) {
      return apiError(
        "Invalid Google Sheets URL. Expected format: https://docs.google.com/spreadsheets/d/SHEET_ID/edit",
        422
      );
    }

    // Fetch the sheet as CSV via Google's export URL
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const res = await fetch(exportUrl);

    if (!res.ok) {
      if (res.status === 404) {
        return apiError("Google Sheet not found. Check the URL.", 422);
      }
      if (res.status === 403 || res.status === 401) {
        return apiError(
          'Google Sheet is not publicly accessible. Set sharing to "Anyone with the link can view".',
          422
        );
      }
      return apiError(`Failed to fetch Google Sheet (${res.status})`, 422);
    }

    const csvText = await res.text();

    // Check if we got an HTML error page instead of CSV
    if (csvText.trim().startsWith("<!DOCTYPE") || csvText.trim().startsWith("<html")) {
      return apiError(
        'Google Sheet is not publicly accessible. Set sharing to "Anyone with the link can view".',
        422
      );
    }

    const buffer = new TextEncoder().encode(csvText).buffer;
    const fileHash = crypto
      .createHash("sha256")
      .update(Buffer.from(buffer))
      .digest("hex");

    const filename = `google-sheet-${sheetId.slice(0, 8)}.csv`;

    const result = parseExcel(buffer);

    // Store validation record
    await db.insert(uploadValidations).values({
      agentId: user.id,
      originalFilename: filename,
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
        originalFilename: filename,
        fileHash,
        parseStatus: "parsed",
        callStatus: "ready",
        totalNumbers: result.entries.length,
        botCredentialId: botCredentialId || null,
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

    // Update validation record with call list ID
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
