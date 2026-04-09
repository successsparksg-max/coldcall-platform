import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  const wb = XLSX.utils.book_new();

  const data = [
    ["Phone Number"],
    ["+6591234567"],
    ["+6589876543"],
    ["89001234"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 20 }];

  XLSX.utils.book_append_sheet(wb, ws, "Phone List");

  // Instructions sheet
  const instructions = [
    ["Phone List Upload Instructions"],
    [""],
    ["1. Enter phone numbers in column A"],
    ["2. Accepted formats: +6591234567, 91234567, +1234567890"],
    ["3. Singapore numbers (8/9 prefix) auto-get +65"],
    ["4. Maximum 1,000 numbers per upload"],
    ["5. Delete the example rows before uploading"],
    [""],
    ["You can also upload a plain CSV or paste a Google Sheets URL."],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions["!cols"] = [{ wch: 55 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="phone_list_template.xlsx"',
    },
  });
}
