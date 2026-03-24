"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Settings, CheckCircle, XCircle } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export default function AdminCredentialsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [credStatuses, setCredStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/agents")
      .then((r) => r.json())
      .then(async (data) => {
        const agentUsers = data.data || [];
        setAgents(agentUsers);

        const statuses: Record<string, boolean> = {};
        await Promise.all(
          agentUsers.map(async (agent: Agent) => {
            try {
              const res = await fetch(`/api/credentials/${agent.id}`);
              const cred = await res.json();
              const bots = Array.isArray(cred.data) ? cred.data : [];
              statuses[agent.id] = bots.some((b: { credentialsComplete?: boolean }) => b.credentialsComplete);
            } catch {
              statuses[agent.id] = false;
            }
          })
        );
        setCredStatuses(statuses);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent Credentials</h1>
        <p className="text-sm text-gray-500">
          Manage ElevenLabs and telephony credentials for each agent.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Credentials</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-gray-500">
                No agents found.
              </TableCell>
            </TableRow>
          )}
          {agents.map((agent) => (
            <TableRow key={agent.id}>
              <TableCell>
                <div className="font-medium">{agent.name}</div>
                <div className="text-xs text-gray-500">{agent.email}</div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={agent.isActive ? "default" : "secondary"}
                  className={
                    agent.isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }
                >
                  {agent.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                {credStatuses[agent.id] ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Configured</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-500">
                    <XCircle className="h-4 w-4" />
                    <span className="text-sm">Not Configured</span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Link href={`/admin/agents/${agent.id}/credentials`}>
                  <Button variant="outline" size="sm">
                    <Settings className="mr-1 h-4 w-4" />
                    Manage
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
