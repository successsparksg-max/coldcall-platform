import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "public", "coldcall_upload_template.xlsx");
    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="coldcall_upload_template.xlsx"',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Template file not found" },
      { status: 404 }
    );
  }
}
