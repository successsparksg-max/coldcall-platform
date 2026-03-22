import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { agentCredentials } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import { eq, and } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    await requireRole("it_admin", "admin");
    const { agentId } = await params;

    // Accept botId in body to test a specific bot
    let botId: string | null = null;
    try {
      const body = await req.json();
      botId = body.botId || null;
    } catch {
      // No body — test first bot
    }

    let cred;
    if (botId) {
      const [found] = await db
        .select()
        .from(agentCredentials)
        .where(
          and(
            eq(agentCredentials.id, botId),
            eq(agentCredentials.agentId, agentId)
          )
        )
        .limit(1);
      cred = found;
    } else {
      const [found] = await db
        .select()
        .from(agentCredentials)
        .where(eq(agentCredentials.agentId, agentId))
        .limit(1);
      cred = found;
    }

    if (!cred) {
      return apiError("No credentials found", 404);
    }

    const results: {
      test: string;
      status: "pass" | "fail";
      message: string;
    }[] = [];

    // Test 1: ElevenLabs API key
    const apiKey = decrypt(cred.elevenlabsApiKey);
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": apiKey },
      });
      results.push({
        test: "ElevenLabs API Key",
        status: res.ok ? "pass" : "fail",
        message: res.ok ? "API key valid" : `API returned ${res.status}`,
      });
    } catch {
      results.push({
        test: "ElevenLabs API Key",
        status: "fail",
        message: "Connection failed",
      });
    }

    // Test 2: ElevenLabs agent exists
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/agents/${cred.elevenlabsAgentId}`,
        { headers: { "xi-api-key": apiKey } }
      );
      results.push({
        test: "ElevenLabs Agent",
        status: res.ok ? "pass" : "fail",
        message: res.ok ? "Agent found" : `Agent not found (${res.status})`,
      });
    } catch {
      results.push({
        test: "ElevenLabs Agent",
        status: "fail",
        message: "Connection failed",
      });
    }

    // Test 3: Provider-specific
    if (cred.elevenlabsPhoneNumberId) {
      const phoneIds = cred.elevenlabsPhoneNumberId
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      const passed: string[] = [];
      const failed: string[] = [];
      for (const phoneId of phoneIds) {
        try {
          const res = await fetch(
            `https://api.elevenlabs.io/v1/convai/phone-numbers/${phoneId}`,
            { headers: { "xi-api-key": apiKey } }
          );
          if (res.ok) passed.push(phoneId);
          else failed.push(`${phoneId} (${res.status})`);
        } catch {
          failed.push(`${phoneId} (connection failed)`);
        }
      }
      results.push({
        test: "Phone Numbers",
        status: failed.length === 0 ? "pass" : "fail",
        message:
          failed.length === 0
            ? `${passed.length} phone number(s) found`
            : `Not found: ${failed.join(", ")}`,
      });
    } else if (cred.didwwPhoneNumber) {
      const numbers = cred.didwwPhoneNumber
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      const allValid =
        numbers.length > 0 &&
        numbers.every((n) => /^\+\d{7,15}$/.test(n));
      results.push({
        test: "DIDWW Phone Number",
        status: allValid ? "pass" : "fail",
        message: allValid
          ? `${numbers.length} phone number(s) valid`
          : `Invalid format: ${numbers.filter((n) => !/^\+\d{7,15}$/.test(n)).join(", ")}`,
      });
    }

    const allPassed = results.every((r) => r.status === "pass");
    return apiSuccess({ results, allPassed });
  } catch (error) {
    return handleAuthError(error);
  }
}
