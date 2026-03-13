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
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/convai/phone-numbers/${cred.elevenlabsPhoneNumberId}`,
          { headers: { "xi-api-key": apiKey } }
        );
        if (res.ok) {
          results.push({
            test: "Twilio Phone Number",
            status: "pass",
            message: "Phone number found",
          });
        } else {
          results.push({
            test: "Twilio Phone Number",
            status: "fail",
            message: `Phone number not found (${res.status})`,
          });
        }
      } catch {
        results.push({
          test: "Twilio Phone Number",
          status: "fail",
          message: "Connection failed",
        });
      }
    } else if (cred.telephonyProvider === "didww" && cred.didwwPhoneNumber) {
      const phoneValid = /^\+\d{7,15}$/.test(cred.didwwPhoneNumber);
      results.push({
        test: "DIDWW Phone Number",
        status: phoneValid ? "pass" : "fail",
        message: phoneValid
          ? "Phone number format valid"
          : "Invalid phone number format",
      });
    }

    const allPassed = results.every((r) => r.status === "pass");
    return apiSuccess({ results, allPassed });
  } catch (error) {
    return handleAuthError(error);
  }
}
