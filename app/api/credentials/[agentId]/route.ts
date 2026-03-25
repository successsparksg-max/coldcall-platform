import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { agentCredentials, callLists } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { encrypt, decrypt, maskCredential } from "@/lib/encryption";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const credentialSchema = z.object({
  botId: z.string().optional(), // if provided, update existing bot
  botLabel: z.string().min(1).optional(),
  elevenlabsApiKey: z.string().optional(),
  elevenlabsAgentId: z.string().min(1),
  elevenlabsWebhookSecret: z.string().optional(),
  telephonyProvider: z.enum(["twilio", "didww"]),
  elevenlabsPhoneNumberId: z.string().optional(),
  didwwPhoneNumber: z.string().optional(),
  outboundCallerId: z.string().optional(),
});

// GET: return ALL bot credentials for an agent
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    await requireRole("it_admin", "admin");
    const { agentId } = await params;

    const creds = await db
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.agentId, agentId));

    const masked = creds.map((cred) => ({
      id: cred.id,
      agentId: cred.agentId,
      botLabel: cred.botLabel,
      elevenlabsApiKey: maskCredential(decrypt(cred.elevenlabsApiKey)),
      elevenlabsAgentId: cred.elevenlabsAgentId,
      elevenlabsWebhookSecret: cred.elevenlabsWebhookSecret ? "****" : null,
      telephonyProvider: cred.telephonyProvider,
      elevenlabsPhoneNumberId: cred.elevenlabsPhoneNumberId,
      didwwPhoneNumber: cred.didwwPhoneNumber,
      outboundCallerId: cred.outboundCallerId,
      credentialsComplete: cred.credentialsComplete,
      updatedAt: cred.updatedAt,
    }));

    return apiSuccess(masked);
  } catch (error) {
    return handleAuthError(error);
  }
}

// PUT: create or update a bot credential
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
    if (data.telephonyProvider === "twilio" && !data.elevenlabsPhoneNumberId) {
      return apiError("Phone Number ID required for Twilio provider", 422);
    }
    if (
      data.telephonyProvider === "didww" &&
      !data.didwwPhoneNumber &&
      !data.elevenlabsPhoneNumberId
    ) {
      return apiError(
        "Either ElevenLabs Phone Number ID(s) or DIDWW phone number(s) required",
        422
      );
    }

    // Check for existing bot (by botId or by matching agent+elevenlabsAgentId)
    let existingCred = null;
    if (data.botId) {
      const [found] = await db
        .select()
        .from(agentCredentials)
        .where(
          and(
            eq(agentCredentials.id, data.botId),
            eq(agentCredentials.agentId, agentId)
          )
        )
        .limit(1);
      existingCred = found || null;
    }

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
      return apiError(
        "ElevenLabs API Key is required for new bot credentials",
        422
      );
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
      (data.telephonyProvider === "didww" ? data.didwwPhoneNumber : undefined);

    const values = {
      agentId,
      botLabel: data.botLabel || existingCred?.botLabel || "Default Bot",
      elevenlabsApiKey: encryptedApiKey,
      elevenlabsAgentId: data.elevenlabsAgentId,
      elevenlabsWebhookSecret: encryptedWebhookSecret,
      telephonyProvider: data.telephonyProvider as "twilio" | "didww",
      elevenlabsPhoneNumberId: data.elevenlabsPhoneNumberId || null,
      didwwPhoneNumber: data.didwwPhoneNumber || null,
      outboundCallerId: outboundCallerId || null,
      credentialsComplete: true,
      updatedBy: isUuid(user.id) ? user.id : null,
      updatedAt: new Date(),
    };

    if (existingCred) {
      await db
        .update(agentCredentials)
        .set(values)
        .where(eq(agentCredentials.id, existingCred.id));
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
              platform_settings: { webhook: webhookConfig },
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
      message: "Bot credentials saved",
      webhookConfigured,
      webhookError,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

// DELETE: remove a specific bot credential
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    await requireRole("it_admin", "admin");
    const { agentId } = await params;
    const { botId } = await req.json();

    if (!botId) return apiError("botId is required", 422);

    // Get remaining bots (excluding the one being deleted)
    const remainingBots = await db
      .select({ id: agentCredentials.id })
      .from(agentCredentials)
      .where(
        and(
          eq(agentCredentials.agentId, agentId),
          eq(agentCredentials.credentialsComplete, true)
        )
      );
    const otherBots = remainingBots.filter((b) => b.id !== botId);

    // Redistribute the deleted bot's lists to remaining bots
    if (otherBots.length > 0) {
      const orphanedLists = await db
        .select({ id: callLists.id })
        .from(callLists)
        .where(eq(callLists.botCredentialId, botId));

      for (let i = 0; i < orphanedLists.length; i++) {
        const newBot = otherBots[i % otherBots.length];
        await db
          .update(callLists)
          .set({ botCredentialId: newBot.id })
          .where(eq(callLists.id, orphanedLists[i].id));
      }
    }

    await db
      .delete(agentCredentials)
      .where(
        and(
          eq(agentCredentials.id, botId),
          eq(agentCredentials.agentId, agentId)
        )
      );

    return apiSuccess({ message: "Bot credential deleted" });
  } catch (error) {
    return handleAuthError(error);
  }
}
