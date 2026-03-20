"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentStatsCard } from "@/components/AgentStatsCard";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users,
  Phone,
  PhoneIncoming,
  Star,
  Calendar,
  FileCheck,
  UserPlus,
  CheckCircle,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

interface PlatformStats {
  totalAgents: number;
  totalLists: number;
  totalCalls: number;
  totalAnswered: number;
  avgRating: number | null;
  totalBooked: number;
  hotLeads: {
    id: string;
    name: string | null;
    email: string | null;
    phoneNumber: string | null;
    rating: number | null;
    summary: string | null;
    bookingStatus: string | null;
    createdAt: string;
    agentName: string | null;
  }[];
  uploadQuality: { total: number; passed: number; rate: number };
}

interface AgentRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isPaid: boolean;
  plan: string;
  credentialsConfigured: boolean;
  totalLists: number;
  totalCalls: number;
  callsAnswered: number;
  avgRating: number | null;
  appointmentsBooked: number;
  lastActive: string | null;
}

export default function AdminPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [emailResult, setEmailResult] = useState<{
    sent: boolean;
    error: string | null;
  } | null>(null);
  const [editAgent, setEditAgent] = useState<AgentRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [saving, setSaving] = useState(false);

  function fetchData() {
    Promise.all([
      fetch("/api/admin/stats").then((r) => r.json()),
      fetch("/api/admin/agents").then((r) => r.json()),
    ]).then(([statsData, agentsData]) => {
      setStats(statsData.data);
      setAgents(agentsData.data || []);
    });
  }

  useEffect(() => {
    fetchData();
    setLoading(false);
  }, []);

  async function handleCreateAgent(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setEmailResult(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "agent" }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Agent "${form.name}" created`);
        setEmailResult({
          sent: data.data.emailSent,
          error: data.data.emailError,
        });
        setForm({ email: "", name: "", password: "" });
        fetchData();
        if (data.data.emailSent) {
          setTimeout(() => {
            setDialogOpen(false);
            setEmailResult(null);
          }, 3000);
        }
      } else {
        toast.error(data.error || "Failed to create agent");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(agentId: string, isActive: boolean) {
    const res = await fetch(`/api/users/${agentId}`, {
      method: isActive ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: isActive ? undefined : JSON.stringify({ isActive: true }),
    });
    if (res.ok) {
      toast.success(isActive ? "Agent deactivated" : "Agent reactivated");
      fetchData();
    } else {
      toast.error("Failed to update agent status");
    }
  }

  async function handleEditAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!editAgent) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editAgent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name, email: editForm.email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Agent updated");
        setEditAgent(null);
        fetchData();
      } else {
        toast.error(data.error || "Failed to update agent");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Master Dashboard</h1>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEmailResult(null);
          }}
        >
          <DialogTrigger>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Agent</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAgent} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Initial Password</Label>
                <Input
                  type="text"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                />
                <p className="text-xs text-gray-500">
                  This password will be emailed to the agent.
                </p>
              </div>

              {emailResult && (
                <div
                  className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                    emailResult.sent
                      ? "bg-green-50 text-green-700"
                      : "bg-yellow-50 text-yellow-700"
                  }`}
                >
                  {emailResult.sent ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {emailResult.sent
                    ? "Welcome email sent successfully!"
                    : `Agent created but email failed: ${emailResult.error}. Share the password manually.`}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? "Creating..." : "Create Agent & Send Email"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <AgentStatsCard
            title="Total Agents"
            value={stats.totalAgents}
            icon={Users}
          />
          <AgentStatsCard
            title="Total Calls"
            value={stats.totalCalls}
            icon={Phone}
          />
          <AgentStatsCard
            title="Answered"
            value={stats.totalAnswered}
            icon={PhoneIncoming}
          />
          <AgentStatsCard
            title="Avg Rating"
            value={stats.avgRating ?? "-"}
            icon={Star}
          />
          <AgentStatsCard
            title="Appointments"
            value={stats.totalBooked}
            icon={Calendar}
          />
          <AgentStatsCard
            title="Upload Pass Rate"
            value={`${stats.uploadQuality.rate}%`}
            icon={FileCheck}
            description={`${stats.uploadQuality.passed}/${stats.uploadQuality.total} uploads`}
          />
        </div>
      )}

      {/* Agents table */}
      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Lists</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Answered</TableHead>
                <TableHead>Avg Rating</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                    <Badge
                      variant={agent.isPaid ? "default" : "destructive"}
                      className={
                        agent.isPaid
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }
                    >
                      {agent.isPaid ? "Paid" : "Unpaid"}
                    </Badge>
                  </TableCell>
                  <TableCell>{agent.totalLists}</TableCell>
                  <TableCell>{agent.totalCalls}</TableCell>
                  <TableCell>{agent.callsAnswered}</TableCell>
                  <TableCell>
                    {agent.avgRating ? (
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {agent.avgRating}
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>{agent.appointmentsBooked}</TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {agent.lastActive
                      ? new Date(agent.lastActive).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditAgent(agent);
                          setEditForm({ name: agent.name, email: agent.email });
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Link href={`/admin/agents/${agent.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(agent.id, agent.isActive)}
                      >
                        {agent.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Hot Leads */}
      {stats && stats.hotLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Hot Leads (Rating 4-5, Booked)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.hotLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {lead.name || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {lead.phoneNumber}
                    </TableCell>
                    <TableCell>{lead.email || "-"}</TableCell>
                    <TableCell className="text-sm">{lead.agentName || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {lead.rating}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      {lead.summary}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Agent Dialog */}
      <Dialog open={!!editAgent} onOpenChange={(open) => { if (!open) setEditAgent(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditAgent} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
