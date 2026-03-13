import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { agentCredentials } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { encrypt, decrypt, maskCredential } from "@/lib/encryption";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const credentialSchema = z.object({
  elevenlabsApiKey: z.string().min(1),
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
    if (data.telephonyProvider === "didww" && !data.didwwPhoneNumber) {
      return apiError(
        "DIDWW phone number required for DIDWW provider",
        422
      );
    }

    const encryptedApiKey = encrypt(data.elevenlabsApiKey);
    const encryptedWebhookSecret = data.elevenlabsWebhookSecret
      ? encrypt(data.elevenlabsWebhookSecret)
      : null;

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
      updatedBy: user.id,
      updatedAt: new Date(),
    };

    // Upsert
    const existing = await db
      .select({ id: agentCredentials.id })
      .from(agentCredentials)
      .where(eq(agentCredentials.agentId, agentId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(agentCredentials)
        .set(values)
        .where(eq(agentCredentials.agentId, agentId));
    } else {
      await db.insert(agentCredentials).values(values);
    }

    return apiSuccess({ message: "Credentials saved" });
  } catch (error) {
    return handleAuthError(error);
  }
}
