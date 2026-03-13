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

export default function DashboardPage() {
  const [lists, setLists] = useState<CallList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/call-lists")
      .then((res) => res.json())
      .then((data) => {
        setLists(data.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalCalls = lists.reduce((sum, l) => sum + (l.callsMade || 0), 0);
  const answered = lists.reduce((sum, l) => sum + (l.callsAnswered || 0), 0);
  const noAnswer = lists.reduce((sum, l) => sum + (l.callsNoAnswer || 0), 0);

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
          value={lists.length}
          icon={ListChecks}
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
        />
        <AgentStatsCard
          title="No Answer"
          value={noAnswer}
          icon={PhoneOff}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Call Lists</h2>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : lists.length === 0 ? (
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
              {lists.map((list) => (
                <TableRow key={list.id}>
                  <TableCell className="font-medium">
                    {list.originalFilename}
                  </TableCell>
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
