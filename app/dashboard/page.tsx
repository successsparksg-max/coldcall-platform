"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentStatsCard } from "@/components/AgentStatsCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Phone,
  PhoneIncoming,
  PhoneOff,
  ListChecks,
  Upload,
} from "lucide-react";
import type { CallList } from "@/lib/types";

interface Bot {
  id: string;
  botLabel: string;
}

export default function DashboardPage() {
  const [lists, setLists] = useState<CallList[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/call-lists")
        .then((res) => res.json())
        .then((data) => setLists(data.data || [])),
      fetch("/api/my-bots")
        .then((res) => res.json())
        .then((data) => {
          const botList = data.data || [];
          setBots(botList);
          if (botList.length > 0 && !selectedBot) {
            setSelectedBot(botList[0].id);
          }
        }),
    ]).finally(() => setLoading(false));
  }, []);

  const visibleLists =
    selectedBot === "unassigned"
      ? lists.filter((l) => !l.botCredentialId)
      : selectedBot
        ? lists.filter((l) => l.botCredentialId === selectedBot)
        : lists;

  const totalCalls = visibleLists.reduce(
    (sum, l) => sum + (l.callsMade || 0),
    0
  );
  const answered = visibleLists.reduce(
    (sum, l) => sum + (l.callsAnswered || 0),
    0
  );
  const noAnswer = visibleLists.reduce(
    (sum, l) => sum + (l.callsNoAnswer || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/dashboard/upload">
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload List
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AgentStatsCard
          title="Total Lists"
          value={visibleLists.length}
          icon={ListChecks}
        />
        <AgentStatsCard title="Total Calls" value={totalCalls} icon={Phone} />
        <AgentStatsCard
          title="Answered"
          value={answered}
          icon={PhoneIncoming}
        />
        <AgentStatsCard title="No Answer" value={noAnswer} icon={PhoneOff} />
      </div>

      {/* Bot tabs */}
      {bots.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Agent Bots</h2>
          <div className="flex gap-3">
            {bots.map((bot) => {
              const botLists = lists.filter(
                (l) => l.botCredentialId === bot.id
              );
              const isActive = selectedBot === bot.id;
              const botAnswered = botLists.reduce(
                (s, l) => s + (l.callsAnswered || 0),
                0
              );
              const botNoAnswer = botLists.reduce(
                (s, l) => s + (l.callsNoAnswer || 0),
                0
              );
              return (
                <button
                  key={bot.id}
                  onClick={() => setSelectedBot(bot.id)}
                  className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${
                    isActive
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Phone className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-gray-400"}`} />
                    <span className={`font-semibold ${isActive ? "text-blue-700" : "text-gray-700"}`}>
                      {bot.botLabel}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>{botLists.length} lists</span>
                    <span className="text-green-600">{botAnswered} answered</span>
                    <span className="text-red-500">{botNoAnswer} no answer</span>
                  </div>
                </button>
              );
            })}
            {lists.some((l) => !l.botCredentialId) && (
              <button
                onClick={() => setSelectedBot("unassigned")}
                className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${
                  selectedBot === "unassigned"
                    ? "border-yellow-500 bg-yellow-50 shadow-sm"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-yellow-500" />
                  <span className="font-semibold text-gray-700">Unassigned</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {lists.filter((l) => !l.botCredentialId).length} lists
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Call Lists
          {bots.length > 1 && selectedBot && selectedBot !== "unassigned" && (
            <span className="ml-2 text-base font-normal text-gray-500">
              — {bots.find((b) => b.id === selectedBot)?.botLabel}
            </span>
          )}
        </h2>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : visibleLists.length === 0 ? (
          <p className="text-gray-500">
            No call lists yet. Upload your first list to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Made</TableHead>
                <TableHead>Answered</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLists.map((list) => (
                <TableRow key={list.id}>
                  <TableCell className="font-medium">
                    {list.originalFilename}
                  </TableCell>
                  <TableCell>
                    {list.callStatus === "completed" &&
                    (list.totalNumbers || 0) > 0 &&
                    (list.callsAnswered || 0) < (list.totalNumbers || 0) ? (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                        Partial
                      </span>
                    ) : (
                      <StatusBadge status={list.callStatus} />
                    )}
                  </TableCell>
                  <TableCell>{list.totalNumbers}</TableCell>
                  <TableCell>{list.callsMade}</TableCell>
                  <TableCell>{list.callsAnswered}</TableCell>
                  <TableCell>
                    {list.uploadedAt
                      ? new Date(list.uploadedAt).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/lists/${list.id}`} target="_blank">
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
