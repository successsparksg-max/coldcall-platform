"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  UserPlus,
  CheckCircle,
  AlertCircle,
  Settings,
  XCircle,
  Pencil,
  Users,
  Shield,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function ITAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [credStatuses, setCredStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "agent" as "agent" | "admin",
  });
  const [creating, setCreating] = useState(false);
  const [emailResult, setEmailResult] = useState<{
    sent: boolean;
    error: string | null;
  } | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [saving, setSaving] = useState(false);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      const allUsers = data.data || [];
      setUsers(allUsers);

      // Check credential status for agents
      const agents = allUsers.filter((u: User) => u.role === "agent");
      const statuses: Record<string, boolean> = {};
      await Promise.all(
        agents.map(async (agent: User) => {
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
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setEmailResult(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`User "${form.name}" created`);
        setEmailResult({
          sent: data.data.emailSent,
          error: data.data.emailError,
        });
        setForm({ email: "", name: "", password: "", role: "agent" });
        fetchUsers();
        if (data.data.emailSent) {
          setTimeout(() => {
            setDialogOpen(false);
            setEmailResult(null);
          }, 3000);
        }
      } else {
        toast.error(data.error || "Failed to create user");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(userId: string, isActive: boolean) {
    const res = await fetch(`/api/users/${userId}`, {
      method: isActive ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: isActive ? undefined : JSON.stringify({ isActive: true }),
    });
    if (res.ok) {
      toast.success(isActive ? "User deactivated" : "User reactivated");
      fetchUsers();
    }
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name, email: editForm.email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("User updated");
        setEditUser(null);
        fetchUsers();
      } else {
        toast.error(data.error || "Failed to update user");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-base text-gray-500">Loading...</p>;

  const agents = users.filter((u) => u.role === "agent");
  const admins = users.filter((u) => u.role === "admin");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">IT Admin Dashboard</h1>
          <p className="mt-1 text-base text-gray-500">
            Manage users and agent credentials
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
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-xl">Create New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-5">
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
                  This password will be emailed to the user.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-base">Role</Label>
                <div className="flex gap-4 text-base">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value="agent"
                      checked={form.role === "agent"}
                      onChange={() => setForm({ ...form, role: "agent" })}
                    />
                    Agent (Insurance Salesperson)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={form.role === "admin"}
                      onChange={() => setForm({ ...form, role: "admin" })}
                    />
                    Admin (Agency Head)
                  </label>
                </div>
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
                    : `User created but email failed: ${emailResult.error}. Share the password manually.`}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full text-base h-12" disabled={creating}>
                {creating ? "Creating..." : "Create User & Send Email"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-5">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Total Users</span>
            <div className="rounded-lg p-2 bg-gray-100">
              <Users className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-gray-900">{users.length}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Admins</span>
            <div className="rounded-lg p-2 bg-purple-100">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-gray-900">{admins.length}</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Agents</span>
            <div className="rounded-lg p-2 bg-blue-100">
              <UserCheck className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-blue-700">{agents.length}</div>
        </div>
      </div>

      {/* Users Table */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">All Users</h2>
        <div className="overflow-hidden rounded-xl border bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-sm font-semibold text-gray-600 py-4 px-5">Name</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4">Email</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4">Role</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4">Status</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4">Credentials</TableHead>
                <TableHead className="text-sm font-semibold text-gray-600 py-4">Created</TableHead>
                <TableHead className="py-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-base text-gray-500 py-8">
                    No users yet. Create one to get started.
                  </TableCell>
                </TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.id} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="text-base font-medium text-gray-900 py-4 px-5">{u.name}</TableCell>
                  <TableCell className="text-base text-gray-700 py-4">{u.email}</TableCell>
                  <TableCell className="py-4">
                    <Badge
                      variant="secondary"
                      className={
                        u.role === "admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }
                    >
                      {u.role === "admin" ? "Admin" : "Agent"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      variant={u.isActive ? "default" : "secondary"}
                      className={
                        u.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    {u.role === "agent" ? (
                      credStatuses[u.id] ? (
                        <div className="flex items-center gap-1.5 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">Configured</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-red-500">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">Not Set</span>
                        </div>
                      )
                    ) : (
                      <span className="text-sm text-gray-400">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 py-4">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0"
                        onClick={() => {
                          setEditUser(u);
                          setEditForm({ name: u.name, email: u.email });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {u.role === "agent" && (
                        <Link
                          href={`/it-admin/agents/${u.id}/credentials`}
                        >
                          <Button variant="outline" className="text-sm">
                            <Settings className="mr-1.5 h-4 w-4" />
                            Credentials
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="outline"
                        className="text-sm"
                        onClick={() =>
                          toggleActive(u.id, u.isActive ?? true)
                        }
                      >
                        {u.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl">Edit User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditUser} className="space-y-5">
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
