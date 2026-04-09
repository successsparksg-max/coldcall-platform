"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentStatsCard } from "@/components/AgentStatsCard";
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

  if (loading) return <p className="text-base text-gray-500">Loading...</p>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Master Dashboard</h1>
          <p className="mt-1 text-base text-gray-500">
            Monitor all agents and platform performance
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEmailResult(null);
          }}
        >
          <DialogTrigger>
            <Button size="lg" className="text-base px-6 py-3 h-auto">
              <UserPlus className="mr-2 h-5 w-5" />
              Create Agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-xl">Create New Agent</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAgent} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-base">Full Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  required
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  required
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Initial Password</Label>
                <Input
                  type="text"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className="h-11 text-base"
                />
                <p className="text-sm text-gray-500">
                  This password will be emailed to the agent.
                </p>
              </div>

              {emailResult && (
                <div
                  className={`flex items-center gap-3 rounded-xl p-4 text-base ${
                    emailResult.sent
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                  }`}
                >
                  {emailResult.sent ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <AlertCircle className="h-5 w-5" />
                  )}
                  {emailResult.sent
                    ? "Welcome email sent successfully!"
                    : `Agent created but email failed: ${emailResult.error}. Share the password manually.`}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full text-base h-12" disabled={creating}>
                {creating ? "Creating..." : "Create Agent & Send Email"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-6">
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
            color="green"
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
            color="blue"
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
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Agents</h2>
        <div className="overflow-hidden rounded-xl border bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-sm font-semibold text-gray-600 py-4 px-5">Name</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4">Status</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4">Payment</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4 text-center">Lists</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4 text-center">Calls</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4 text-center">Answered</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4 text-center">Avg Rating</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4 text-center">Booked</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4">Last Active</TableHead>
                <TableHead className="py-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="py-4 px-5">
                    <div className="text-base font-medium text-gray-900">{agent.name}</div>
                    <div className="text-sm text-gray-500">{agent.email}</div>
                  </TableCell>
                  <TableCell className="py-4">
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
                  <TableCell className="py-4">
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
                  <TableCell className="text-base text-gray-700 py-4 text-center">{agent.totalLists}</TableCell>
                  <TableCell className="text-base text-gray-700 py-4 text-center">{agent.totalCalls}</TableCell>
                  <TableCell className="text-base text-gray-700 py-4 text-center">{agent.callsAnswered}</TableCell>
                  <TableCell className="py-4 text-center">
                    {agent.avgRating ? (
                      <div className="flex items-center justify-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-base font-medium">{agent.avgRating}</span>
                      </div>
                    ) : (
                      <span className="text-base text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-base text-gray-700 py-4 text-center">{agent.appointmentsBooked}</TableCell>
                  <TableCell className="text-sm text-gray-500 py-4">
                    {agent.lastActive
                      ? new Date(agent.lastActive).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0"
                        onClick={() => {
                          setEditAgent(agent);
                          setEditForm({ name: agent.name, email: agent.email });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Link href={`/admin/agents/${agent.id}`}>
                        <Button variant="outline" className="text-sm">
                          View
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        className="text-sm"
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
        </div>
      </div>

      {/* Hot Leads */}
      {stats && stats.hotLeads.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Hot Leads (Rating 4-5, Booked)</h2>
          <div className="overflow-hidden rounded-xl border bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-sm font-semibold text-gray-600 py-4 px-5">Name</TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4">Phone</TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4">Email</TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4">Agent</TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4">Rating</TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4">Summary</TableHead>
                  <TableHead className="text-sm font-semibold text-gray-600 py-4">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.hotLeads.map((lead) => (
                  <TableRow key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="text-base font-medium text-gray-900 py-4 px-5">
                      {lead.name || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-base text-gray-700 py-4">
                      {lead.phoneNumber}
                    </TableCell>
                    <TableCell className="text-base text-gray-700 py-4">{lead.email || "-"}</TableCell>
                    <TableCell className="text-base text-gray-700 py-4">{lead.agentName || "-"}</TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-base font-medium">{lead.rating}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-base text-gray-700 py-4">
                      {lead.summary}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 py-4">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Edit Agent Dialog */}
      <Dialog open={!!editAgent} onOpenChange={(open) => { if (!open) setEditAgent(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl">Edit Agent</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditAgent} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-base">Full Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
                className="h-11 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-base">Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                required
                className="h-11 text-base"
              />
            </div>
            <Button type="submit" size="lg" className="w-full text-base h-12" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
