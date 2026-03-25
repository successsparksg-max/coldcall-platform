"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Download, CheckCircle } from "lucide-react";

interface Bot {
  id: string;
  botLabel: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>("");
  const [loadingBots, setLoadingBots] = useState(true);
  const [result, setResult] = useState<{
    callListId: string;
    totalEntries: number;
    warnings: { type: string; message: string }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/my-bots")
      .then((r) => r.json())
      .then((data) => {
        const botList = data.data || [];
        setBots(botList);
        if (botList.length === 1) setSelectedBotId(botList[0].id);
      })
      .finally(() => setLoadingBots(false));
  }, []);

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

      {/* Bot selector */}
      {!loadingBots && bots.length === 0 && (
        <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
          No agent bots configured. Contact your IT admin to set up credentials.
        </div>
      )}

      {!loadingBots && bots.length > 0 && (
        <div className="space-y-2">
          <Label>Assign to Agent Bot *</Label>
          {bots.length === 1 ? (
            <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm">
              {bots[0].botLabel}
            </div>
          ) : (
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
            >
              <option value="">Select a bot...</option>
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.botLabel}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-gray-500">
            This bot will be used to make calls for this list.
          </p>
        </div>
      )}

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
              onClick={() =>
                router.push(`/dashboard/lists/${result.callListId}`)
              }
            >
              View Call List
            </Button>
            <Button variant="outline" onClick={() => setResult(null)}>
              Upload Another
            </Button>
          </div>
        </div>
      ) : (
        <FileUploader
          onUploadSuccess={setResult}
          botCredentialId={selectedBotId || null}
          disabled={!selectedBotId}
        />
      )}
    </div>
  );
}
