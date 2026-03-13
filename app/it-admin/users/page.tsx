"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { UserPlus, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function ManageUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
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

  async function fetchUsers() {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data.data || []);
    setLoading(false);
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

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manage Users</h1>
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
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
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
                  This password will be emailed to the user.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex gap-4">
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
                    : `User created but email failed: ${emailResult.error}. Share the password manually.`}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? "Creating..." : "Create User & Send Email"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
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
                  <TableCell>
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
                  <TableCell className="text-xs text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(u.id, u.isActive ?? true)}
                    >
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
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
