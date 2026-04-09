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
import { Play, Pause, XCircle, Star, ArrowLeft, Trash2, RefreshCw, RotateCcw, Sparkles, Download, Hash, Users, Phone as PhoneIcon, CheckCircle, PhoneOff, AlertTriangle } from "lucide-react";
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

  // Auto-fix stuck "in_progress" lists with no active entries
  useEffect(() => {
    if (!list || list.callStatus !== "in_progress") return;
    const hasActive = entries.some(
      (e) =>
        e.callStatus === "calling" ||
        e.callStatus === "called" ||
        e.callStatus === "pending"
    );
    if (!hasActive && entries.length > 0) {
      // No entries left to call — mark as completed
      fetch(`/api/call-lists/${id}/complete`, { method: "POST" })
        .then(() => fetchData())
        .catch(() => {});
    }
  }, [list, entries, id, fetchData]);

  // Update browser tab title with real-time status
  useEffect(() => {
    if (!list) return;
    const botName = (list as CallList & { botLabel?: string }).botLabel || "";
    const prefix = botName ? `${botName} | ` : "";
    const total = list.totalNumbers || 0;
    const answered = list.callsAnswered || 0;
    const noAnswer = list.callsNoAnswer || 0;
    const stats = `${answered} ans, ${noAnswer} no ans`;

    if (list.callStatus === "in_progress") {
      const calling = entries.find((e) => e.callStatus === "calling");
      if (calling) {
        document.title = `${prefix}Calling ${calling.contactName}... | ${stats}`;
      } else {
        document.title = `${prefix}In Progress | ${stats}`;
      }
    } else if (list.callStatus === "paused") {
      document.title = `${prefix}Paused | ${stats}`;
    } else if (list.callStatus === "completed") {
      document.title = `${prefix}Done — ${stats} / ${total}`;
    } else if (list.callStatus === "ready") {
      document.title = `${prefix}Ready — ${total} contacts`;
    } else {
      document.title = `${prefix}${list.originalFilename}`;
    }

    return () => {
      document.title = "Cold Call Platform";
    };
  }, [list, entries]);

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

  if (loading) return <p className="text-base text-gray-500">Loading...</p>;
  if (!list) return <p className="text-base text-red-500">Call list not found</p>;

  const progress = list.totalNumbers
    ? Math.round(((list.callsMade || 0) / list.totalNumbers) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="lg" className="h-11 w-11 p-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">{list.originalFilename}</h1>
          {(list as CallList & { botLabel?: string }).botLabel && (
            <span className="text-base text-gray-500">
              Bot: {(list as CallList & { botLabel?: string }).botLabel}
            </span>
          )}
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={list.callStatus} />
            <span className="text-base text-gray-500">
              {list.callsMade || 0} / {list.totalNumbers} calls made
            </span>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap justify-end">
          {list.callStatus === "ready" && (
            <Button size="lg" className="text-base px-6 py-3 h-auto" onClick={() => handleAction("start")}>
              <Play className="mr-2 h-5 w-5" /> Start
            </Button>
          )}
          {list.callStatus === "in_progress" && (
            <Button
              variant="outline"
              size="lg"
              className="text-base px-5 py-3 h-auto"
              onClick={() => handleAction("pause")}
            >
              <Pause className="mr-2 h-5 w-5" /> Pause
            </Button>
          )}
          {list.callStatus === "paused" && (
            <Button size="lg" className="text-base px-6 py-3 h-auto" onClick={() => handleAction("resume")}>
              <Play className="mr-2 h-5 w-5" /> Resume
            </Button>
          )}
          {(list.callStatus === "in_progress" ||
            list.callStatus === "paused") && (
            <Button
              variant="destructive"
              size="lg"
              className="text-base px-5 py-3 h-auto"
              onClick={() => handleAction("cancel")}
            >
              <XCircle className="mr-2 h-5 w-5" /> Cancel
            </Button>
          )}
          {entries.length > 0 && (
            <Button
              variant="outline"
              size="lg"
              className="text-base px-5 py-3 h-auto"
              onClick={handleDownload}
            >
              <Download className="mr-2 h-5 w-5" /> Download
            </Button>
          )}
          {hasStaleEntries && list.callStatus !== "in_progress" && (
            <Button
              variant="outline"
              size="lg"
              className="text-base px-5 py-3 h-auto"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw
                className={`mr-2 h-5 w-5 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing..." : "Sync Calls"}
            </Button>
          )}
          {hasRetryableEntries && list.callStatus !== "in_progress" && (
            <Button
              variant="outline"
              size="lg"
              className="text-base px-5 py-3 h-auto"
              onClick={handleRetry}
              disabled={retrying}
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              {retrying ? "Resetting..." : "Retry Failed"}
            </Button>
          )}
          {hasAnsweredWithoutAnalysis && list.callStatus !== "in_progress" && (
            <Button
              variant="outline"
              size="lg"
              className="text-base px-5 py-3 h-auto"
              onClick={handleReanalyze}
              disabled={reanalyzing}
            >
              <Sparkles
                className={`mr-2 h-5 w-5 ${reanalyzing ? "animate-pulse" : ""}`}
              />
              {reanalyzing ? "Analyzing..." : "Re-analyze"}
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {list.callStatus === "in_progress" && (
        <div className="h-3 w-full rounded-full bg-gray-200">
          <div
            className="h-3 rounded-full bg-blue-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Total</span>
            <div className="rounded-lg p-2 bg-gray-100">
              <Hash className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-gray-900">{list.totalNumbers}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Answered</span>
            <div className="rounded-lg p-2 bg-emerald-100">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-emerald-700">
            {list.callsAnswered || 0}
          </div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">No Answer</span>
            <div className="rounded-lg p-2 bg-red-100">
              <PhoneOff className="h-5 w-5 text-red-500" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-red-600">
            {list.callsNoAnswer || 0}
          </div>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Failed</span>
            <div className="rounded-lg p-2 bg-orange-100">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-orange-600">
            {list.callsFailed || 0}
          </div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Made</span>
            <div className="rounded-lg p-2 bg-blue-100">
              <PhoneIcon className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-blue-700">
            {list.callsMade || 0}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          {STATUS_FILTERS.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize text-sm">
              {s === "all"
                ? `All (${entries.length})`
                : `${s.replace("_", " ")} (${entries.filter((e) => e.callStatus === s).length})`}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Entries table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-sm font-semibold text-gray-600 py-4 px-5">#</TableHead>
              <TableHead className="text-sm font-semibold text-gray-600 py-4">Contact</TableHead>
              <TableHead className="text-sm font-semibold text-gray-600 py-4">Phone</TableHead>
              <TableHead className="text-sm font-semibold text-gray-600 py-4">Status</TableHead>
              <TableHead className="text-sm font-semibold text-gray-600 py-4 text-center">Attempts</TableHead>
              <TableHead className="text-sm font-semibold text-gray-600 py-4">Rating</TableHead>
              <TableHead className="text-sm font-semibold text-gray-600 py-4">Booking</TableHead>
              <TableHead className="py-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.map((entry) => (
              <>
                <TableRow
                  key={entry.id}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() =>
                    setExpandedEntry(
                      expandedEntry === entry.id ? null : entry.id
                    )
                  }
                >
                  <TableCell className="text-base text-gray-700 py-4 px-5">{entry.sortOrder + 1}</TableCell>
                  <TableCell className="py-4">
                    <div className="text-base font-medium text-gray-900">{entry.contactName}</div>
                    {entry.company && (
                      <div className="text-sm text-gray-500">
                        {entry.company}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-base text-gray-700 py-4">
                    {entry.phoneNumber}
                  </TableCell>
                  <TableCell className="py-4">
                    <StatusBadge status={entry.callStatus} />
                  </TableCell>
                  <TableCell className="text-base text-gray-700 py-4 text-center">
                    {(entry.callAttempts || 0) + 1}
                  </TableCell>
                  <TableCell className="py-4">
                    {entry.analysis?.rating && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-base font-medium">{entry.analysis.rating}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    {entry.analysis?.bookingStatus === "TRUE" && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                        Booked
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400 cursor-pointer hover:text-gray-600">
                        {expandedEntry === entry.id ? "Close" : "Details"}
                      </span>
                      {canRemoveEntries &&
                        (entry.callStatus === "pending" ||
                          entry.callStatus === "skipped") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveEntry(entry.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
                {expandedEntry === entry.id && entry.analysis && (
                  <TableRow key={`${entry.id}-analysis`}>
                    <TableCell colSpan={8} className="bg-gray-50 p-5">
                      <CallAnalysisCard analysis={entry.analysis} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
