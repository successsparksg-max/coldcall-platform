"use client";

import { useEffect, useState, use } from "react";
import { CredentialForm } from "@/components/CredentialForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CredentialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [agentName, setAgentName] = useState("");
  const [initialData, setInitialData] = useState<{
    elevenlabsApiKey: string;
    elevenlabsAgentId: string;
    elevenlabsWebhookSecret: string | null;
    telephonyProvider: string;
    elevenlabsPhoneNumberId: string | null;
    didwwPhoneNumber: string | null;
    outboundCallerId: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/users")
        .then((r) => r.json())
        .then((data) => {
          const agent = (data.data || []).find(
            (u: { id: string }) => u.id === id
          );
          if (agent) setAgentName(agent.name);
        }),
      fetch(`/api/credentials/${id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.data) setInitialData(data.data);
        }),
    ]).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/it-admin">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Manage Credentials</h1>
      </div>
      <CredentialForm
        agentId={id}
        agentName={agentName || "Agent"}
        initialData={initialData}
      />
    </div>
  );
}
