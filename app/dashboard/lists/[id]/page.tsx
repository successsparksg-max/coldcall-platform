"use client";

import { useEffect, useState, useCallback, use } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { CallAnalysisCard } from "@/components/CallAnalysisCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, Pause, XCircle, Star, ArrowLeft, Trash2, RefreshCw, RotateCcw, Sparkles, Download } from "lucide-react";
import * as XLSX from "xlsx";
import Link from "next/link";
import type { CallList, CallEntryWithAnalysis } from "@/lib/types";
import { toast } from "sonner";

const STATUS_FILTERS = [
  "all",
  "pending",
  "answered",
  "no_answer",
  "busy",
  "failed",
  "calling",
  "called",
] as const;

export default function CallListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [list, setList] = useState<CallList | null>(null);
  const [entries, setEntries] = useState<CallEntryWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/call-lists/${id}`);
      const data = await res.json();
      if (data.success) {
        setList(data.data.list);
        setEntries(data.data.entries);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll during active calls
  const callStatus = list?.callStatus;
  useEffect(() => {
    if (
      !callStatus ||
      (callStatus !== "in_progress" && callStatus !== "paused")
    )
      return;

    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [callStatus, fetchData]);

  async function handleAction(action: "start" | "pause" | "resume" | "cancel") {
    try {
      const res = await fetch(`/api/call-lists/${id}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Call list ${action}ed`);
        fetchData();
      } else {
        toast.error(data.error || `Failed to ${action}`);
      }
    } catch {
      toast.error(`Failed to ${action}`);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/call-lists/${id}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.data.message);
        fetchData();
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleReanalyze() {
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/call-lists/${id}/reanalyze`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.data.message);
        // Poll for results after a delay
        setTimeout(fetchData, 5000);
        setTimeout(fetchData, 15000);
      } else {
        toast.error(data.error || "Re-analysis failed");
      }
    } catch {
      toast.error("Re-analysis failed");
    } finally {
      setReanalyzing(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/call-lists/${id}/retry`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.data.message);
        fetchData();
      } else {
        toast.error(data.error || "Retry failed");
      }
    } catch {
      toast.error("Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  async function handleRemoveEntry(entryId: string) {
    try {
      const res = await fetch(`/api/call-lists/${id}/entries/${entryId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Entry removed");
        fetchData();
      } else {
        toast.error(data.error || "Failed to remove entry");
      }
    } catch {
      toast.error("Failed to remove entry");
    }
  }

  function handleDownload() {
    const rows = entries.map((e) => ({
      "#": e.sortOrder + 1,
      "Contact Name": e.contactName,
      "Company": e.company || "",
      "Phone Number": e.phoneNumber,
      "Status": e.callStatus.replace("_", " "),
      "Attempts": (e.callAttempts || 0) + 1,
      "Rating": e.analysis?.rating ?? "",
      "Summary": e.analysis?.summary || "",
      "Booking Status": e.analysis?.bookingStatus === "TRUE" ? "Booked" : e.analysis?.bookingStatus === "FALSE" ? "Not Booked" : "",
      "Booking Location": e.analysis?.bookingLocation || "",
      "Booking Date": e.analysis?.bookingDate || "",
      "Booking Time": e.analysis?.bookingTime || "",
      "Contact Email": e.analysis?.email || "",
      "Contact Name (from call)": e.analysis?.name || "",
      "Duration (s)": e.analysis?.duration ?? "",
      "Cost (credits)": e.analysis?.callCost ? Math.round(Number(e.analysis.callCost)) : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...rows.map((r) => String(r[key as keyof typeof r] ?? "").length)
      );
      return { wch: Math.min(maxLen + 2, 50) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Call Results");
    const filename = (list?.originalFilename || "call-list")
      .replace(/\.xlsx?$/i, "")
      + "_results.xlsx";
    XLSX.writeFile(wb, filename);
  }

  const canRemoveEntries =
    list?.callStatus === "ready" ||
    list?.callStatus === "paused" ||
    list?.callStatus === "completed" ||
    list?.callStatus === "cancelled";

  const hasStaleEntries = entries.some(
    (e) => e.callStatus === "called" || e.callStatus === "calling"
  );

  const hasRetryableEntries = entries.some(
    (e) =>
      e.callStatus === "no_answer" ||
      e.callStatus === "busy" ||
      e.callStatus === "failed"
  );

  const hasAnsweredWithoutAnalysis = entries.some(
    (e) => e.callStatus === "answered" && !e.analysis
  );

  const filteredEntries =
    filter === "all"
      ? entries
      : entries.filter((e) => e.callStatus === filter);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!list) return <p className="text-red-500">Call list not found</p>;

  const progress = list.totalNumbers
    ? Math.round(((list.callsMade || 0) / list.totalNumbers) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{list.originalFilename}</h1>
          {(list as CallList & { botLabel?: string }).botLabel && (
            <span className="text-sm text-gray-500">
              Bot: {(list as CallList & { botLabel?: string }).botLabel}
            </span>
          )}
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={list.callStatus} />
            <span className="text-sm text-gray-500">
              {list.callsMade || 0} / {list.totalNumbers} calls made
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {list.callStatus === "ready" && (
            <Button onClick={() => handleAction("start")}>
              <Play className="mr-1 h-4 w-4" /> Start
            </Button>
          )}
          {list.callStatus === "in_progress" && (
            <Button
              variant="outline"
              onClick={() => handleAction("pause")}
            >
              <Pause className="mr-1 h-4 w-4" /> Pause
            </Button>
          )}
          {list.callStatus === "paused" && (
            <Button onClick={() => handleAction("resume")}>
              <Play className="mr-1 h-4 w-4" /> Resume
            </Button>
          )}
          {(list.callStatus === "in_progress" ||
            list.callStatus === "paused") && (
            <Button
              variant="destructive"
              onClick={() => handleAction("cancel")}
            >
              <XCircle className="mr-1 h-4 w-4" /> Cancel
            </Button>
          )}
          {entries.length > 0 && (
            <Button
              variant="outline"
              onClick={handleDownload}
            >
              <Download className="mr-1 h-4 w-4" /> Download
            </Button>
          )}
          {hasStaleEntries && list.callStatus !== "in_progress" && (
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw
                className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing..." : "Sync Calls"}
            </Button>
          )}
          {hasRetryableEntries && list.callStatus !== "in_progress" && (
            <Button
              variant="outline"
              onClick={handleRetry}
              disabled={retrying}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              {retrying ? "Resetting..." : "Retry Failed"}
            </Button>
          )}
          {hasAnsweredWithoutAnalysis && list.callStatus !== "in_progress" && (
            <Button
              variant="outline"
              onClick={handleReanalyze}
              disabled={reanalyzing}
            >
              <Sparkles
                className={`mr-1 h-4 w-4 ${reanalyzing ? "animate-pulse" : ""}`}
              />
              {reanalyzing ? "Analyzing..." : "Re-analyze"}
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {list.callStatus === "in_progress" && (
        <div className="h-2 w-full rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3 text-center text-sm">
        <div className="rounded-md bg-gray-50 p-3">
          <div className="text-lg font-bold">{list.totalNumbers}</div>
          <div className="text-gray-500">Total</div>
        </div>
        <div className="rounded-md bg-green-50 p-3">
          <div className="text-lg font-bold text-green-700">
            {list.callsAnswered || 0}
          </div>
          <div className="text-gray-500">Answered</div>
        </div>
        <div className="rounded-md bg-red-50 p-3">
          <div className="text-lg font-bold text-red-600">
            {list.callsNoAnswer || 0}
          </div>
          <div className="text-gray-500">No Answer</div>
        </div>
        <div className="rounded-md bg-orange-50 p-3">
          <div className="text-lg font-bold text-orange-600">
            {list.callsFailed || 0}
          </div>
          <div className="text-gray-500">Failed</div>
        </div>
        <div className="rounded-md bg-blue-50 p-3">
          <div className="text-lg font-bold text-blue-600">
            {list.callsMade || 0}
          </div>
          <div className="text-gray-500">Made</div>
        </div>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          {STATUS_FILTERS.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">
              {s === "all"
                ? `All (${entries.length})`
                : `${s.replace("_", " ")} (${entries.filter((e) => e.callStatus === s).length})`}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Entries table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Booking</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredEntries.map((entry) => (
            <>
              <TableRow
                key={entry.id}
                className="cursor-pointer"
                onClick={() =>
                  setExpandedEntry(
                    expandedEntry === entry.id ? null : entry.id
                  )
                }
              >
                <TableCell>{entry.sortOrder + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{entry.contactName}</div>
                  {entry.company && (
                    <div className="text-xs text-gray-500">
                      {entry.company}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {entry.phoneNumber}
                </TableCell>
                <TableCell>
                  <StatusBadge status={entry.callStatus} />
                </TableCell>
                <TableCell className="text-center">
                  {(entry.callAttempts || 0) + 1}
                </TableCell>
                <TableCell>
                  {entry.analysis?.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm">{entry.analysis.rating}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {entry.analysis?.bookingStatus === "TRUE" && (
                    <span className="text-xs font-medium text-green-600">
                      Booked
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 cursor-pointer">
                      {expandedEntry === entry.id ? "Close" : "Details"}
                    </span>
                    {canRemoveEntries &&
                      (entry.callStatus === "pending" ||
                        entry.callStatus === "skipped") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveEntry(entry.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                  </div>
                </TableCell>
              </TableRow>
              {expandedEntry === entry.id && entry.analysis && (
                <TableRow key={`${entry.id}-analysis`}>
                  <TableCell colSpan={8} className="bg-gray-50 p-4">
                    <CallAnalysisCard analysis={entry.analysis} />
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
