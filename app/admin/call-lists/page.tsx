"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CallList } from "@/lib/types";

interface Agent {
  id: string;
  name: string;
  email: string;
}

interface CallListWithAgent extends CallList {
  agentName: string;
  agentEmail: string;
  booked: number;
}

export default function AdminCallListsPage() {
  const [lists, setLists] = useState<CallListWithAgent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/call-lists")
      .then((r) => r.json())
      .then((listsData) => {
        const allLists: CallListWithAgent[] = (listsData.data || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (list: any) => ({
            ...list,
            agentName: list.agentName || "Unknown",
            agentEmail: list.agentEmail || "",
            booked: list.booked || 0,
          })
        );

        setLists(allLists);

        // Extract unique agents from the list data
        const agentMap = new Map<string, Agent>();
        allLists.forEach((l) => {
          if (l.agentId && !agentMap.has(l.agentId)) {
            agentMap.set(l.agentId, {
              id: l.agentId,
              name: l.agentName,
              email: l.agentEmail,
            });
          }
        });
        setAgents(Array.from(agentMap.values()));
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredLists =
    selectedAgent === "all"
      ? lists
      : lists.filter((l) => l.agentId === selectedAgent);

  const totalCalls = filteredLists.reduce(
    (s, l) => s + (l.callsMade || 0),
    0
  );
  const totalAnswered = filteredLists.reduce(
    (s, l) => s + (l.callsAnswered || 0),
    0
  );

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Call Lists</h1>
          <p className="text-sm text-gray-500">
            View all agent call lists and their progress
          </p>
        </div>
        <Select value={selectedAgent} onValueChange={(val) => setSelectedAgent(val || "all")}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filter by agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{filteredLists.length}</div>
            <p className="text-sm text-gray-500">Total Lists</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalCalls}</div>
            <p className="text-sm text-gray-500">Calls Made</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalAnswered}</div>
            <p className="text-sm text-gray-500">Answered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {totalCalls > 0
                ? `${Math.round((totalAnswered / totalCalls) * 100)}%`
                : "-"}
            </div>
            <p className="text-sm text-gray-500">Answer Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Call Lists Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedAgent === "all"
              ? "All Call Lists"
              : `Call Lists — ${agents.find((a) => a.id === selectedAgent)?.name}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Made</TableHead>
                <TableHead>Answered</TableHead>
                <TableHead>No Answer</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLists.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-center text-gray-500"
                  >
                    No call lists found.
                  </TableCell>
                </TableRow>
              )}
              {filteredLists.map((list) => (
                <TableRow key={list.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{list.agentName}</div>
                    <div className="text-xs text-gray-400">
                      {list.agentEmail}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {list.originalFilename}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={list.callStatus} />
                  </TableCell>
                  <TableCell>{list.totalNumbers}</TableCell>
                  <TableCell>{list.callsMade}</TableCell>
                  <TableCell>{list.callsAnswered}</TableCell>
                  <TableCell>{list.callsNoAnswer}</TableCell>
                  <TableCell>{list.callsFailed}</TableCell>
                  <TableCell>{list.booked}</TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {list.uploadedAt
                      ? new Date(list.uploadedAt).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/call-lists/${list.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
