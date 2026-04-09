"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Download, CheckCircle, Upload } from "lucide-react";

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
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Upload Call List</h1>
        <p className="mt-2 text-base text-gray-500">
          Download the Excel template, fill in your contacts, then upload below.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="rounded-lg p-2 bg-blue-100">
            <Download className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-base font-medium text-gray-900">Excel Template</p>
            <p className="text-sm text-gray-500">
              Use this template to format your contact list
            </p>
          </div>
          <a href="/api/template/download">
            <Button variant="outline" size="lg" className="text-base px-5 py-3 h-auto">
              <Download className="mr-2 h-5 w-5" />
              Download
            </Button>
          </a>
        </div>
      </div>

      {/* Bot selector */}
      {!loadingBots && bots.length === 0 && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-5 text-base text-yellow-700">
          No agent bots configured. Contact your IT admin to set up credentials.
        </div>
      )}

      {!loadingBots && bots.length > 0 && (
        <div className="space-y-3">
          <Label className="text-base font-medium text-gray-900">Assign to Agent Bot *</Label>
          {bots.length === 1 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base">
              {bots[0].botLabel}
            </div>
          ) : (
            <select
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
          <p className="text-sm text-gray-500">
            This bot will be used to make calls for this list.
          </p>
        </div>
      )}

      {result ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4 rounded-xl bg-green-50 border border-green-200 p-5">
            <div className="rounded-lg p-2 bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-green-700">
                Upload successful!
              </p>
              <p className="text-base text-green-600">
                {result.totalEntries} contacts validated and ready.
              </p>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-5 text-base text-yellow-700">
              <p className="font-semibold">Warnings:</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-4">
            <Button
              size="lg"
              className="text-base px-6 py-3 h-auto"
              onClick={() =>
                router.push(`/dashboard/lists/${result.callListId}`)
              }
            >
              View Call List
            </Button>
            <Button variant="outline" size="lg" className="text-base px-6 py-3 h-auto" onClick={() => setResult(null)}>
              <Upload className="mr-2 h-5 w-5" />
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
