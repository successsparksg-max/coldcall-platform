"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle } from "lucide-react";

export default function UploadPage() {
  const router = useRouter();
  const [result, setResult] = useState<{
    callListId: string;
    totalEntries: number;
    warnings: { type: string; message: string }[];
  } | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Upload Call List</h1>

      <div>
        <a href="/api/template/download">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>
        </a>
        <p className="mt-2 text-sm text-gray-500">
          Download the Excel template, fill in your contacts, then upload
          below.
        </p>
      </div>

      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-md bg-green-50 p-4">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-medium text-green-700">
                Upload successful!
              </p>
              <p className="text-sm text-green-600">
                {result.totalEntries} contacts validated and ready.
              </p>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
              <p className="font-medium">Warnings:</p>
              <ul className="mt-1 list-disc pl-5">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => router.push(`/dashboard/lists/${result.callListId}`)}
            >
              View Call List
            </Button>
            <Button
              variant="outline"
              onClick={() => setResult(null)}
            >
              Upload Another
            </Button>
          </div>
        </div>
      ) : (
        <FileUploader onUploadSuccess={setResult} />
      )}
    </div>
  );
}
