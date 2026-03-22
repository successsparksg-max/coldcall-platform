"use client";

import { useEffect, useState, useCallback, use } from "react";
import { CredentialForm, BotConfig } from "@/components/CredentialForm";
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
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, credsRes] = await Promise.all([
        fetch("/api/users").then((r) => r.json()),
        fetch(`/api/credentials/${id}`).then((r) => r.json()),
      ]);

      const agent = (usersRes.data || []).find(
        (u: { id: string }) => u.id === id
      );
      if (agent) setAgentName(agent.name);

      // API now returns an array of bot configs
      const botsData = credsRes.data || [];
      setBots(
        (Array.isArray(botsData) ? botsData : [botsData]).filter(Boolean).map(
          (b: Record<string, string | null>) => ({
            id: b.id || undefined,
            botLabel: b.botLabel || "Default Bot",
            elevenlabsApiKey: "",
            elevenlabsAgentId: b.elevenlabsAgentId || "",
            elevenlabsWebhookSecret: "",
            telephonyProvider: b.telephonyProvider || "didww",
            elevenlabsPhoneNumberId: b.elevenlabsPhoneNumberId || "",
            didwwPhoneNumber: b.didwwPhoneNumber || "",
            outboundCallerId: b.outboundCallerId || "",
          })
        )
      );
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        initialBots={bots}
        onRefresh={fetchData}
      />
    </div>
  );
}
