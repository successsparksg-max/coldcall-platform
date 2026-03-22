"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface BotConfig {
  id?: string;
  botLabel: string;
  elevenlabsApiKey: string;
  elevenlabsAgentId: string;
  elevenlabsWebhookSecret: string;
  telephonyProvider: string;
  elevenlabsPhoneNumberId: string;
  didwwPhoneNumber: string;
  outboundCallerId: string;
}

interface CredentialFormProps {
  agentId: string;
  agentName: string;
  initialBots: BotConfig[];
  onRefresh: () => void;
}

interface TestResult {
  test: string;
  status: "pass" | "fail";
  message: string;
}

function emptyBot(): BotConfig {
  return {
    botLabel: "",
    elevenlabsApiKey: "",
    elevenlabsAgentId: "",
    elevenlabsWebhookSecret: "",
    telephonyProvider: "didww",
    elevenlabsPhoneNumberId: "",
    didwwPhoneNumber: "",
    outboundCallerId: "",
  };
}

function BotForm({
  bot,
  index,
  agentId,
  onSave,
  onDelete,
  isOnly,
}: {
  bot: BotConfig;
  index: number;
  agentId: string;
  onSave: () => void;
  onDelete: () => void;
  isOnly: boolean;
}) {
  const [form, setForm] = useState<BotConfig>({ ...bot });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);

  function updateField(field: string, value: string) {
    setForm({ ...form, [field]: value });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, string | undefined> = {
        botLabel: form.botLabel || `Bot ${index + 1}`,
        elevenlabsAgentId: form.elevenlabsAgentId,
        telephonyProvider: form.telephonyProvider,
      };
      if (bot.id) payload.botId = bot.id;
      if (form.elevenlabsApiKey) payload.elevenlabsApiKey = form.elevenlabsApiKey;
      if (form.elevenlabsWebhookSecret) payload.elevenlabsWebhookSecret = form.elevenlabsWebhookSecret;
      if (form.elevenlabsPhoneNumberId) payload.elevenlabsPhoneNumberId = form.elevenlabsPhoneNumberId;
      if (form.outboundCallerId) payload.outboundCallerId = form.outboundCallerId;
      if (form.didwwPhoneNumber) payload.didwwPhoneNumber = form.didwwPhoneNumber;

      const res = await fetch(`/api/credentials/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.data?.webhookConfigured) {
          toast.success("Bot saved & webhook configured");
        } else if (data.data?.webhookError) {
          toast.success("Bot saved, webhook auto-config failed: " + data.data.webhookError);
        } else {
          toast.success("Bot saved");
        }
        onSave();
      } else {
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!bot.id) {
      toast.error("Save the bot first before testing");
      return;
    }
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetch(`/api/credentials/${agentId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: bot.id }),
      });
      const data = await res.json();
      if (data.data?.results) {
        setTestResults(data.data.results);
      } else {
        toast.error(data.error || "Test failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!bot.id) {
      onDelete();
      return;
    }
    if (!confirm(`Delete bot "${form.botLabel || `Bot ${index + 1}`}"?`)) return;
    try {
      const res = await fetch(`/api/credentials/${agentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: bot.id }),
      });
      if (res.ok) {
        toast.success("Bot deleted");
        onSave();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Network error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {bot.id ? form.botLabel || `Bot ${index + 1}` : "New Bot"}
          </CardTitle>
          {!isOnly && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-500 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Bot Label *</Label>
          <Input
            placeholder="e.g. English Bot, SG Line 1"
            value={form.botLabel}
            onChange={(e) => updateField("botLabel", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>ElevenLabs API Key</Label>
          <Input
            type="password"
            placeholder={bot.id ? "Leave empty to keep existing" : "sk_..."}
            value={form.elevenlabsApiKey}
            onChange={(e) => updateField("elevenlabsApiKey", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>ElevenLabs Agent ID *</Label>
          <Input
            placeholder="agent_01jx78nk7j..."
            value={form.elevenlabsAgentId}
            onChange={(e) => updateField("elevenlabsAgentId", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Post-Call Webhook HMAC Secret</Label>
          <Input
            type="password"
            placeholder={bot.id ? "Leave empty to keep existing" : "Paste HMAC secret"}
            value={form.elevenlabsWebhookSecret}
            onChange={(e) => updateField("elevenlabsWebhookSecret", e.target.value)}
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>Telephony Provider *</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`provider-${index}`}
                value="twilio"
                checked={form.telephonyProvider === "twilio"}
                onChange={() => updateField("telephonyProvider", "twilio")}
              />
              Twilio (via ElevenLabs)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`provider-${index}`}
                value="didww"
                checked={form.telephonyProvider === "didww"}
                onChange={() => updateField("telephonyProvider", "didww")}
              />
              DIDWW (Direct SIP)
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>ElevenLabs Phone Number ID(s)</Label>
          <Input
            placeholder="phnum_abc123, phnum_def456"
            value={form.elevenlabsPhoneNumberId}
            onChange={(e) => updateField("elevenlabsPhoneNumberId", e.target.value)}
          />
          <p className="text-xs text-gray-500">
            Comma-separated. Found in the URL in ElevenLabs → Phone Numbers.
          </p>
        </div>

        {form.telephonyProvider === "didww" && (
          <div className="space-y-2">
            <Label>DIDWW Phone Number(s)</Label>
            <Input
              placeholder="+6531252383, +6531252384"
              value={form.didwwPhoneNumber}
              onChange={(e) => updateField("didwwPhoneNumber", e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Only if numbers are NOT registered in ElevenLabs.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Outbound Caller ID(s)</Label>
          <Input
            placeholder="+6531060237, +6531065066"
            value={form.outboundCallerId}
            onChange={(e) => updateField("outboundCallerId", e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save Bot
          </Button>
          {bot.id && (
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Test Connection
            </Button>
          )}
        </div>

        {testResults && (
          <div className="space-y-2 rounded-md bg-gray-50 p-3">
            {testResults.map((result, i) => (
              <div key={i} className="flex items-center gap-2">
                {result.status === "pass" ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="font-medium">{result.test}:</span>
                <span className={result.status === "pass" ? "text-green-600" : "text-red-500"}>
                  {result.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CredentialForm({
  agentId,
  agentName,
  initialBots,
  onRefresh,
}: CredentialFormProps) {
  const [bots, setBots] = useState<BotConfig[]>(
    initialBots.length > 0 ? initialBots : []
  );

  function addBot() {
    setBots([...bots, emptyBot()]);
  }

  function removeUnsavedBot(index: number) {
    setBots(bots.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Agent Bots for {agentName}</CardTitle>
              <CardDescription>
                Each bot is a separate ElevenLabs agent that can call in parallel.
                {bots.length > 1 && ` ${bots.length} bots will call ${bots.length} contacts simultaneously.`}
              </CardDescription>
            </div>
            <Button onClick={addBot} variant="outline">
              <Plus className="mr-1 h-4 w-4" /> Add Bot
            </Button>
          </div>
        </CardHeader>
      </Card>

      {bots.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No bots configured. Click &quot;Add Bot&quot; to create one.
          </CardContent>
        </Card>
      )}

      {bots.map((bot, i) => (
        <BotForm
          key={bot.id || `new-${i}`}
          bot={bot}
          index={i}
          agentId={agentId}
          onSave={onRefresh}
          onDelete={() => removeUnsavedBot(i)}
          isOnly={bots.length === 1}
        />
      ))}
    </div>
  );
}
