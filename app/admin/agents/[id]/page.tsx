"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
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
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CreditCard } from "lucide-react";
import { toast } from "sonner";
import type { CallList } from "@/lib/types";

interface AgentDetail {
  agent: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    role: string;
  };
  billing: {
    plan: string;
    isPaid: boolean;
    billingCycleStart: string | null;
    billingCycleEnd: string | null;
    notes: string | null;
  } | null;
  lists: (CallList & { booked: number })[];
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingForm, setBillingForm] = useState({
    plan: "basic",
    isPaid: false,
    billingCycleStart: "",
    billingCycleEnd: "",
    notes: "",
  });

  useEffect(() => {
    fetch(`/api/admin/agents/${id}`)
      .then((r) => r.json())
      .then((res) => {
        setData(res.data);
        if (res.data?.billing) {
          setBillingForm({
            plan: res.data.billing.plan || "basic",
            isPaid: res.data.billing.isPaid || false,
            billingCycleStart: res.data.billing.billingCycleStart || "",
            billingCycleEnd: res.data.billing.billingCycleEnd || "",
            notes: res.data.billing.notes || "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function saveBilling() {
    const res = await fetch(`/api/admin/billing/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(billingForm),
    });
    if (res.ok) {
      toast.success("Billing updated");
      setBillingOpen(false);
    } else {
      toast.error("Failed to update billing");
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!data) return <p className="text-red-500">Agent not found</p>;

  const { agent, billing, lists } = data;
  const totalCalls = lists.reduce((s, l) => s + (l.callsMade || 0), 0);
  const answered = lists.reduce((s, l) => s + (l.callsAnswered || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{agent.name}</h1>
          <p className="text-sm text-gray-500">{agent.email}</p>
        </div>
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
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{lists.length}</div>
            <div className="text-sm text-gray-500">Lists</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{totalCalls}</div>
            <div className="text-sm text-gray-500">Calls Made</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{answered}</div>
            <div className="text-sm text-gray-500">Answered</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">
              {totalCalls > 0
                ? `${Math.round((answered / totalCalls) * 100)}%`
                : "-"}
            </div>
            <div className="text-sm text-gray-500">Answer Rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Billing */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Billing</CardTitle>
          <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
            <DialogTrigger>
              <Button variant="outline" size="sm">
                <CreditCard className="mr-1 h-4 w-4" /> Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Billing</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Plan</Label>
                  <Input
                    value={billingForm.plan}
                    onChange={(e) =>
                      setBillingForm({ ...billingForm, plan: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={billingForm.isPaid}
                    onChange={(e) =>
                      setBillingForm({
                        ...billingForm,
                        isPaid: e.target.checked,
                      })
                    }
                  />
                  <Label>Paid</Label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Cycle Start</Label>
                    <Input
                      type="date"
                      value={billingForm.billingCycleStart}
                      onChange={(e) =>
                        setBillingForm({
                          ...billingForm,
                          billingCycleStart: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Cycle End</Label>
                    <Input
                      type="date"
                      value={billingForm.billingCycleEnd}
                      onChange={(e) =>
                        setBillingForm({
                          ...billingForm,
                          billingCycleEnd: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={billingForm.notes}
                    onChange={(e) =>
                      setBillingForm({ ...billingForm, notes: e.target.value })
                    }
                  />
                </div>
                <Button onClick={saveBilling} className="w-full">
                  Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="flex gap-4">
            <div>
              Plan: <span className="font-medium">{billing?.plan || "basic"}</span>
            </div>
            <div>
              Status:{" "}
              <Badge
                variant={billing?.isPaid ? "default" : "destructive"}
                className={
                  billing?.isPaid
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }
              >
                {billing?.isPaid ? "Paid" : "Unpaid"}
              </Badge>
            </div>
          </div>
          {billing?.notes && (
            <p className="mt-2 text-gray-500">{billing.notes}</p>
          )}
        </CardContent>
      </Card>

      {/* Call Lists */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call Lists</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Made</TableHead>
                <TableHead>Answered</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Uploaded</TableHead>
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
                  <TableCell>{list.booked}</TableCell>
                  <TableCell className="text-xs">
                    {list.uploadedAt
                      ? new Date(list.uploadedAt).toLocaleDateString()
                      : "-"}
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
