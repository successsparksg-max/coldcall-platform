import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { agentCredentials } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { encrypt, decrypt, maskCredential } from "@/lib/encryption";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const credentialSchema = z.object({
  elevenlabsApiKey: z.string().optional(),
  elevenlabsAgentId: z.string().min(1),
  elevenlabsWebhookSecret: z.string().optional(),
  telephonyProvider: z.enum(["twilio", "didww"]),
  elevenlabsPhoneNumberId: z.string().optional(),
  didwwPhoneNumber: z.string().optional(),
  outboundCallerId: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    await requireRole("it_admin", "admin");
    const { agentId } = await params;

    const [cred] = await db
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.agentId, agentId))
      .limit(1);

    if (!cred) {
      return apiSuccess(null);
    }

    // Return masked values
    return apiSuccess({
      id: cred.id,
      agentId: cred.agentId,
      elevenlabsApiKey: maskCredential(decrypt(cred.elevenlabsApiKey)),
      elevenlabsAgentId: cred.elevenlabsAgentId,
      elevenlabsWebhookSecret: cred.elevenlabsWebhookSecret
        ? "****"
        : null,
      telephonyProvider: cred.telephonyProvider,
      elevenlabsPhoneNumberId: cred.elevenlabsPhoneNumberId,
      didwwPhoneNumber: cred.didwwPhoneNumber,
      outboundCallerId: cred.outboundCallerId,
      credentialsComplete: cred.credentialsComplete,
      updatedAt: cred.updatedAt,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await requireRole("it_admin", "admin");
    const { agentId } = await params;
    const body = await req.json();
    const parsed = credentialSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid input: " + parsed.error.message, 422);
    }

    const data = parsed.data;

    // Validate provider-specific fields
    if (
      data.telephonyProvider === "twilio" &&
      !data.elevenlabsPhoneNumberId
    ) {
      return apiError(
        "Phone Number ID required for Twilio provider",
        422
      );
    }
    if (data.telephonyProvider === "didww" && !data.didwwPhoneNumber && !data.elevenlabsPhoneNumberId) {
      return apiError(
        "Either ElevenLabs Phone Number ID(s) or DIDWW phone number(s) required",
        422
      );
    }

    // Fetch existing credentials to preserve API key / webhook secret if not re-entered
    const [existingCred] = await db
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.agentId, agentId))
      .limit(1);

    // API key: use new one if provided, otherwise keep existing
    let encryptedApiKey: string;
    let rawApiKey: string;
    if (data.elevenlabsApiKey) {
      encryptedApiKey = encrypt(data.elevenlabsApiKey);
      rawApiKey = data.elevenlabsApiKey;
    } else if (existingCred) {
      encryptedApiKey = existingCred.elevenlabsApiKey;
      rawApiKey = decrypt(existingCred.elevenlabsApiKey);
    } else {
      return apiError("ElevenLabs API Key is required for new credentials", 422);
    }

    // Webhook secret: use new one if provided, otherwise keep existing
    let encryptedWebhookSecret: string | null;
    if (data.elevenlabsWebhookSecret) {
      encryptedWebhookSecret = encrypt(data.elevenlabsWebhookSecret);
    } else if (existingCred?.elevenlabsWebhookSecret) {
      encryptedWebhookSecret = existingCred.elevenlabsWebhookSecret;
    } else {
      encryptedWebhookSecret = null;
    }

    const outboundCallerId =
      data.outboundCallerId ||
      (data.telephonyProvider === "didww"
        ? data.didwwPhoneNumber
        : undefined);

    const values = {
      agentId,
      elevenlabsApiKey: encryptedApiKey,
      elevenlabsAgentId: data.elevenlabsAgentId,
      elevenlabsWebhookSecret: encryptedWebhookSecret,
      telephonyProvider: data.telephonyProvider as "twilio" | "didww",
      elevenlabsPhoneNumberId: data.elevenlabsPhoneNumberId || null,
      didwwPhoneNumber: data.didwwPhoneNumber || null,
      outboundCallerId: outboundCallerId || null,
      credentialsComplete: true,
      updatedBy: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) ? user.id : null,
      updatedAt: new Date(),
    };

    if (existingCred) {
      await db
        .update(agentCredentials)
        .set(values)
        .where(eq(agentCredentials.agentId, agentId));
    } else {
      await db.insert(agentCredentials).values(values);
    }

    // Auto-configure ElevenLabs webhook URL
    let webhookConfigured = false;
    let webhookError: string | null = null;
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl) {
        const webhookUrl = `${appUrl}/api/webhooks/elevenlabs`;
        const webhookConfig: Record<string, string> = { url: webhookUrl };
        if (data.elevenlabsWebhookSecret) {
          webhookConfig.secret = data.elevenlabsWebhookSecret;
        }
        const res = await fetch(
          `https://api.elevenlabs.io/v1/convai/agents/${data.elevenlabsAgentId}`,
          {
            method: "PATCH",
            headers: {
              "xi-api-key": rawApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              platform_settings: {
                webhook: webhookConfig,
              },
            }),
          }
        );
        webhookConfigured = res.ok;
        if (!res.ok) {
          webhookError = `ElevenLabs returned ${res.status}`;
        }
      }
    } catch (err) {
      webhookError =
        err instanceof Error ? err.message : "Failed to set webhook";
    }

    return apiSuccess({
      message: "Credentials saved",
      webhookConfigured,
      webhookError,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
