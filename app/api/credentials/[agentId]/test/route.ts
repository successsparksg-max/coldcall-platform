import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { agentCredentials } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";

export async function POST(
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
      if (res.ok) {
        results.push({
          test: "ElevenLabs API Key",
          status: "pass",
          message: "API key valid",
        });
      } else {
        results.push({
          test: "ElevenLabs API Key",
          status: "fail",
          message: `API returned ${res.status}`,
        });
      }
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
      if (res.ok) {
        results.push({
          test: "ElevenLabs Agent",
          status: "pass",
          message: "Agent found",
        });
      } else {
        results.push({
          test: "ElevenLabs Agent",
          status: "fail",
          message: `Agent not found (${res.status})`,
        });
      }
    } catch {
      results.push({
        test: "ElevenLabs Agent",
        status: "fail",
        message: "Connection failed",
      });
    }

    // Test 3: Provider-specific
    if (cred.telephonyProvider === "twilio" && cred.elevenlabsPhoneNumberId) {
      const phoneIds = cred.elevenlabsPhoneNumberId.split(",").map((n) => n.trim()).filter(Boolean);
      const passed: string[] = [];
      const failed: string[] = [];
      for (const phoneId of phoneIds) {
        try {
          const res = await fetch(
            `https://api.elevenlabs.io/v1/convai/phone-numbers/${phoneId}`,
            { headers: { "xi-api-key": apiKey } }
          );
          if (res.ok) {
            passed.push(phoneId);
          } else {
            failed.push(`${phoneId} (${res.status})`);
          }
        } catch {
          failed.push(`${phoneId} (connection failed)`);
        }
      }
      if (failed.length === 0) {
        results.push({
          test: "Phone Numbers",
          status: "pass",
          message: `${passed.length} phone number(s) found`,
        });
      } else {
        results.push({
          test: "Phone Numbers",
          status: "fail",
          message: `Not found: ${failed.join(", ")}`,
        });
      }
    } else if (cred.telephonyProvider === "didww" && cred.didwwPhoneNumber) {
      const numbers = cred.didwwPhoneNumber.split(",").map((n) => n.trim()).filter(Boolean);
      const allValid = numbers.length > 0 && numbers.every((n) => /^\+\d{7,15}$/.test(n));
      results.push({
        test: "DIDWW Phone Number",
        status: allValid ? "pass" : "fail",
        message: allValid
          ? `${numbers.length} phone number(s) valid`
          : `Invalid phone number format in: ${numbers.filter((n) => !/^\+\d{7,15}$/.test(n)).join(", ")}`,
      });
    }

    const allPassed = results.every((r) => r.status === "pass");
    return apiSuccess({ results, allPassed });
  } catch (error) {
    return handleAuthError(error);
  }
}
