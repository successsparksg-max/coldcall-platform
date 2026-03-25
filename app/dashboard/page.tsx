"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentStatsCard } from "@/components/AgentStatsCard";
import { StatusBadge } from "@/components/StatusBadge";
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

  const botLabelMap = new Map(bots.map((b) => [b.id, b.botLabel]));

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
      {bots.length > 1 && (
        <Tabs value={selectedBot} onValueChange={setSelectedBot}>
          <TabsList>
            {bots.map((bot) => {
              const count = lists.filter(
                (l) => l.botCredentialId === bot.id
              ).length;
              return (
                <TabsTrigger key={bot.id} value={bot.id}>
                  {bot.botLabel} ({count})
                </TabsTrigger>
              );
            })}
            {lists.some((l) => !l.botCredentialId) && (
              <TabsTrigger value="unassigned">
                Unassigned ({lists.filter((l) => !l.botCredentialId).length})
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Call Lists</h2>
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
                {bots.length > 1 && <TableHead>Bot</TableHead>}
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
                  {bots.length > 1 && (
                    <TableCell className="text-sm text-gray-500">
                      {list.botCredentialId
                        ? botLabelMap.get(list.botCredentialId) || "—"
                        : "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    <StatusBadge status={list.callStatus} />
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
                    <Link href={`/dashboard/lists/${list.id}`}>
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
