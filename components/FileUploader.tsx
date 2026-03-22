"use client";

import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface FileUploaderProps {
  onUploadSuccess: (data: {
    callListId: string;
    totalEntries: number;
    warnings: { type: string; message: string }[];
  }) => void;
}

export function FileUploader({ onUploadSuccess }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    file: string | null;
    headers: string | null;
    rows: { row: number; field: string; message: string }[];
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    setError(null);
    setValidationErrors(null);

    const name = f.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
      setError("Only .xlsx, .xls, and .csv files are accepted");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File size exceeds 10MB limit");
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setValidationErrors(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/call-lists/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.errors) {
          setValidationErrors(data.errors);
        }
        setError(
          data.errors?.file ||
            data.errors?.headers ||
            data.error ||
            "Upload failed"
        );
      } else {
        setFile(null);
        onUploadSuccess({
          callListId: data.callListId,
          totalEntries: data.totalEntries,
          warnings: data.warnings || [],
        });
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        className={`border-2 border-dashed transition-colors ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          {file ? (
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setError(null);
                  setValidationErrors(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Upload className="mb-4 h-10 w-10 text-gray-400" />
              <p className="text-gray-600">
                Drag and drop your spreadsheet here, or
              </p>
              <label className="mt-2 cursor-pointer">
                <span className="text-blue-600 hover:underline">
                  browse files
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </label>
            </>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {validationErrors?.rows && validationErrors.rows.length > 0 && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="mb-2 text-sm font-medium text-red-700">
            Row errors:
          </p>
          <ul className="space-y-1 text-sm text-red-600">
            {validationErrors.rows.slice(0, 20).map((err, i) => (
              <li key={i}>
                Row {err.row}: {err.field} - {err.message}
              </li>
            ))}
            {validationErrors.rows.length > 20 && (
              <li>...and {validationErrors.rows.length - 20} more</li>
            )}
          </ul>
        </div>
      )}

      {file && (
        <Button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full"
        >
          {uploading ? "Uploading..." : "Upload & Validate"}
        </Button>
      )}
    </div>
  );
}
