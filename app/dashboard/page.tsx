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
  Bot,
} from "lucide-react";
import type { CallList } from "@/lib/types";

interface BotInfo {
  id: string;
  botLabel: string;
}

export default function DashboardPage() {
  const [lists, setLists] = useState<CallList[]>([]);
  const [bots, setBots] = useState<BotInfo[]>([]);
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-base text-gray-500">
            Manage your call lists and track performance
          </p>
        </div>
        <Link href="/dashboard/upload">
          <Button size="lg" className="text-base px-6 py-3 h-auto">
            <Upload className="mr-2 h-5 w-5" />
            Upload List
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <AgentStatsCard
          title="Total Lists"
          value={visibleLists.length}
          icon={ListChecks}
          color="blue"
        />
        <AgentStatsCard
          title="Total Calls"
          value={totalCalls}
          icon={Phone}
        />
        <AgentStatsCard
          title="Answered"
          value={answered}
          icon={PhoneIncoming}
          color="green"
        />
        <AgentStatsCard
          title="No Answer"
          value={noAnswer}
          icon={PhoneOff}
          color="red"
        />
      </div>

      {/* Bot selector */}
      {bots.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">
            Agent Bots
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              const botCalls = botLists.reduce(
                (s, l) => s + (l.callsMade || 0),
                0
              );
              return (
                <button
                  key={bot.id}
                  onClick={() => setSelectedBot(bot.id)}
                  className={`rounded-xl border-2 p-5 text-left transition-all ${
                    isActive
                      ? "border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-200"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-lg p-2 ${
                        isActive
                          ? "bg-blue-100 text-blue-600"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      <Bot className="h-5 w-5" />
                    </div>
                    <span
                      className={`text-lg font-semibold ${
                        isActive ? "text-blue-700" : "text-gray-800"
                      }`}
                    >
                      {bot.botLabel}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-gray-800">
                        {botLists.length}
                      </div>
                      <div className="text-xs text-gray-500">Lists</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-emerald-600">
                        {botAnswered}
                      </div>
                      <div className="text-xs text-gray-500">Answered</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-red-500">
                        {botNoAnswer}
                      </div>
                      <div className="text-xs text-gray-500">No Answer</div>
                    </div>
                  </div>
                  {botCalls > 0 && (
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-emerald-500 transition-all"
                          style={{
                            width: `${
                              botCalls > 0
                                ? Math.round((botAnswered / botCalls) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-gray-400 text-right">
                        {botCalls > 0
                          ? Math.round((botAnswered / botCalls) * 100)
                          : 0}
                        % answer rate
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
            {lists.some((l) => !l.botCredentialId) && (
              <button
                onClick={() => setSelectedBot("unassigned")}
                className={`rounded-xl border-2 p-5 text-left transition-all ${
                  selectedBot === "unassigned"
                    ? "border-yellow-500 bg-yellow-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600">
                    <Bot className="h-5 w-5" />
                  </div>
                  <span className="text-lg font-semibold text-gray-700">
                    Unassigned
                  </span>
                </div>
                <div className="mt-4 text-base text-gray-500">
                  {lists.filter((l) => !l.botCredentialId).length} lists
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Call lists table */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          Call Lists
          {bots.length > 1 && selectedBot && selectedBot !== "unassigned" && (
            <span className="ml-2 text-lg font-normal text-gray-400">
              — {bots.find((b) => b.id === selectedBot)?.botLabel}
            </span>
          )}
        </h2>
        {loading ? (
          <p className="text-base text-gray-500">Loading...</p>
        ) : visibleLists.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <ListChecks className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-4 text-lg text-gray-500">
              No call lists yet
            </p>
            <p className="mt-1 text-base text-gray-400">
              Upload your first list to get started
            </p>
            <Link href="/dashboard/upload">
              <Button className="mt-5" size="lg">
                <Upload className="mr-2 h-5 w-5" />
                Upload List
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-sm font-semibold text-gray-600 py-4 px-5">
                    File
                  </TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4">
                    Status
                  </TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4 text-center">
                    Total
                  </TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4 text-center">
                    Made
                  </TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4 text-center">
                    Answered
                  </TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4">
                    Uploaded
                  </TableHead>
                  <TableHead className="py-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLists.map((list) => (
                  <TableRow
                    key={list.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <TableCell className="text-base font-medium text-gray-900 py-4 px-5">
                      {list.originalFilename}
                    </TableCell>
                    <TableCell className="py-4">
                      {list.callStatus === "completed" &&
                      (list.totalNumbers || 0) > 0 &&
                      (list.callsAnswered || 0) <
                        (list.totalNumbers || 0) ? (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
                          Partial
                        </span>
                      ) : (
                        <StatusBadge status={list.callStatus} />
                      )}
                    </TableCell>
                    <TableCell className="text-base text-gray-700 py-4 text-center">
                      {list.totalNumbers}
                    </TableCell>
                    <TableCell className="text-base text-gray-700 py-4 text-center">
                      {list.callsMade}
                    </TableCell>
                    <TableCell className="text-base text-gray-700 py-4 text-center">
                      {list.callsAnswered}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 py-4">
                      {list.uploadedAt
                        ? new Date(list.uploadedAt).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="py-4">
                      <Link
                        href={`/dashboard/lists/${list.id}`}
                        target="_blank"
                      >
                        <Button variant="outline" className="text-sm">
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
