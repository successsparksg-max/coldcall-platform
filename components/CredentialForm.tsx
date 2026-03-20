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
import { CheckCircle, XCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface CredentialFormProps {
  agentId: string;
  agentName: string;
  initialData?: {
    elevenlabsApiKey: string;
    elevenlabsAgentId: string;
    elevenlabsWebhookSecret: string | null;
    telephonyProvider: string;
    elevenlabsPhoneNumberId: string | null;
    didwwPhoneNumber: string | null;
    outboundCallerId: string | null;
  } | null;
}

interface TestResult {
  test: string;
  status: "pass" | "fail";
  message: string;
}

export function CredentialForm({
  agentId,
  agentName,
  initialData,
}: CredentialFormProps) {
  const [form, setForm] = useState({
    elevenlabsApiKey: "",
    elevenlabsAgentId: initialData?.elevenlabsAgentId || "",
    elevenlabsWebhookSecret: "",
    telephonyProvider: initialData?.telephonyProvider || "twilio",
    elevenlabsPhoneNumberId: initialData?.elevenlabsPhoneNumberId || "",
    didwwPhoneNumber: initialData?.didwwPhoneNumber || "",
    outboundCallerId: initialData?.outboundCallerId || "",
  });
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
        elevenlabsApiKey: form.elevenlabsApiKey,
        elevenlabsAgentId: form.elevenlabsAgentId,
        telephonyProvider: form.telephonyProvider,
      };
      if (form.elevenlabsWebhookSecret) {
        payload.elevenlabsWebhookSecret = form.elevenlabsWebhookSecret;
      }
      if (form.elevenlabsPhoneNumberId) {
        payload.elevenlabsPhoneNumberId = form.elevenlabsPhoneNumberId;
      }
      if (form.outboundCallerId) {
        payload.outboundCallerId = form.outboundCallerId;
      }
      if (form.didwwPhoneNumber) {
        payload.didwwPhoneNumber = form.didwwPhoneNumber;
      }

      const res = await fetch(`/api/credentials/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.data?.webhookConfigured) {
          toast.success("Credentials saved & webhook configured automatically");
        } else if (data.data?.webhookError) {
          toast.success("Credentials saved, but webhook auto-config failed: " + data.data.webhookError + ". Set it manually in ElevenLabs.");
        } else {
          toast.success("Credentials saved");
        }
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
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetch(`/api/credentials/${agentId}/test`, {
        method: "POST",
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Credentials for {agentName}</CardTitle>
          <CardDescription>
            Enter the ElevenLabs and telephony credentials provided by the
            agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ElevenLabs */}
          <div className="space-y-2">
            <Label>ElevenLabs API Key *</Label>
            <Input
              type="password"
              placeholder={
                initialData?.elevenlabsApiKey || "sk_..."
              }
              value={form.elevenlabsApiKey}
              onChange={(e) => updateField("elevenlabsApiKey", e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Found in ElevenLabs → Profile → API Keys
            </p>
          </div>

          <div className="space-y-2">
            <Label>ElevenLabs Agent ID *</Label>
            <Input
              placeholder="agent_01jx78nk7j..."
              value={form.elevenlabsAgentId}
              onChange={(e) =>
                updateField("elevenlabsAgentId", e.target.value)
              }
            />
            <p className="text-xs text-gray-500">
              Found in ElevenLabs → Conversational AI → Agent Settings
            </p>
          </div>

          <div className="space-y-2">
            <Label>Post-Call Webhook HMAC Secret</Label>
            <Input
              type="password"
              placeholder="Paste the HMAC secret from ElevenLabs"
              value={form.elevenlabsWebhookSecret}
              onChange={(e) =>
                updateField("elevenlabsWebhookSecret", e.target.value)
              }
              className="font-mono text-sm"
            />
            <p className="text-xs text-gray-500">
              In ElevenLabs: Settings → Post-Call Webhook → Create Webhook → set URL to your app, Auth Method: HMAC. Copy the generated secret and paste it here.
            </p>
          </div>

          {/* Telephony Provider */}
          <div className="space-y-2">
            <Label>Telephony Provider *</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="provider"
                  value="twilio"
                  checked={form.telephonyProvider === "twilio"}
                  onChange={() =>
                    updateField("telephonyProvider", "twilio")
                  }
                />
                Twilio (via ElevenLabs)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="provider"
                  value="didww"
                  checked={form.telephonyProvider === "didww"}
                  onChange={() =>
                    updateField("telephonyProvider", "didww")
                  }
                />
                DIDWW (Direct SIP)
              </label>
            </div>
          </div>

          {/* Provider-specific fields */}
          {form.telephonyProvider === "twilio" ? (
            <>
              <div className="space-y-2">
                <Label>ElevenLabs Phone Number ID(s) *</Label>
                <Input
                  placeholder="phnum_abc123, phnum_def456"
                  value={form.elevenlabsPhoneNumberId}
                  onChange={(e) =>
                    updateField("elevenlabsPhoneNumberId", e.target.value)
                  }
                />
                <p className="text-xs text-gray-500">
                  Comma-separated for multiple numbers. Found in ElevenLabs → Phone Numbers (in the URL: phnum_...). The system will rotate through them.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Outbound Caller ID(s) *</Label>
                <Input
                  placeholder="+6531060237, +6531065066"
                  value={form.outboundCallerId}
                  onChange={(e) =>
                    updateField("outboundCallerId", e.target.value)
                  }
                />
                <p className="text-xs text-gray-500">
                  Comma-separated, matching the order of Phone Number IDs above. The number contacts see when called.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>ElevenLabs Phone Number ID(s)</Label>
                <Input
                  placeholder="phnum_abc123, phnum_def456"
                  value={form.elevenlabsPhoneNumberId}
                  onChange={(e) =>
                    updateField("elevenlabsPhoneNumberId", e.target.value)
                  }
                />
                <p className="text-xs text-gray-500">
                  If your DIDWW numbers are registered in ElevenLabs, enter their phnum_ IDs here (comma-separated). Found in the URL when viewing the number in ElevenLabs → Phone Numbers.
                </p>
              </div>
              <div className="space-y-2">
                <Label>DIDWW Phone Number(s)</Label>
                <Input
                  placeholder="+6531252383, +6531252384"
                  value={form.didwwPhoneNumber}
                  onChange={(e) =>
                    updateField("didwwPhoneNumber", e.target.value)
                  }
                />
                <p className="text-xs text-gray-500">
                  Only needed if numbers are NOT registered in ElevenLabs (direct SIP). Comma-separated for multiple.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Outbound Caller ID(s)</Label>
                <Input
                  placeholder="+6531060237, +6531065066"
                  value={form.outboundCallerId}
                  onChange={(e) =>
                    updateField("outboundCallerId", e.target.value)
                  }
                />
                <p className="text-xs text-gray-500">
                  The number(s) contacts see when called. Comma-separated, matching the order above.
                </p>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Save Credentials
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {testResults.map((result, i) => (
              <div key={i} className="flex items-center gap-2">
                {result.status === "pass" ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="font-medium">{result.test}:</span>
                <span
                  className={
                    result.status === "pass"
                      ? "text-green-600"
                      : "text-red-500"
                  }
                >
                  {result.message}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
