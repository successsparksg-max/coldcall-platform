interface AgentCredentials {
  elevenlabs_api_key: string;
  elevenlabs_agent_id: string;
  telephony_provider: "twilio" | "didww";
  elevenlabs_phone_number_id?: string | null;
  didww_phone_number?: string | null;
  outbound_caller_id?: string | null;
}

export class SIPInitiationError extends Error {
  conversationId: string | null;
  sipCode: number | null;
  constructor(message: string, conversationId: string | null, sipCode: number | null) {
    super(message);
    this.name = "SIPInitiationError";
    this.conversationId = conversationId;
    this.sipCode = sipCode;
  }
}

// SIP response codes that represent "didn't connect" rather than a hard failure:
// phone is off, busy, declined, request terminated, etc. Plus ElevenLabs' internal
// 1011 "canceled".
const NO_ANSWER_SIP_CODES = new Set([
  408, 480, 486, 487, 600, 603, 604, 1011,
]);

export function isNoAnswerSipCode(code: number | null | undefined): boolean {
  return code != null && NO_ANSWER_SIP_CODES.has(code);
}

export function parseSipCode(message: string | null | undefined): number | null {
  if (!message) return null;
  const sip = message.match(/sip status:?\s*(\d+)/i);
  if (sip) return parseInt(sip[1], 10);
  const code = message.match(/"code"\s*:\s*(\d+)/i);
  if (code) return parseInt(code[1], 10);
  return null;
}

export async function initiateOutboundCall(
  credentials: AgentCredentials,
  toNumber: string
): Promise<{ conversation_id: string; callSid?: string }> {
  let url: string;
  let body: Record<string, string>;

  if (credentials.telephony_provider === "twilio") {
    url = "https://api.elevenlabs.io/v1/convai/twilio/outbound-call";
    // Support comma-separated phone number IDs — pick one at random
    const phoneIds = credentials.elevenlabs_phone_number_id!
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const selectedId = phoneIds[Math.floor(Math.random() * phoneIds.length)];
    body = {
      agent_id: credentials.elevenlabs_agent_id,
      agent_phone_number_id: selectedId,
      to_number: toNumber,
    };
  } else if (credentials.elevenlabs_phone_number_id) {
    // SIP trunk numbers registered in ElevenLabs with phnum_ IDs
    url = "https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call";
    const phoneIds = credentials.elevenlabs_phone_number_id
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const selectedId = phoneIds[Math.floor(Math.random() * phoneIds.length)];
    body = {
      agent_id: credentials.elevenlabs_agent_id,
      agent_phone_number_id: selectedId,
      to_number: toNumber,
    };
  } else {
    // DIDWW direct SIP with raw phone numbers
    url = "https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call";
    const numbers = credentials.didww_phone_number!
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const fromNumber = numbers[Math.floor(Math.random() * numbers.length)];
    body = {
      agent_id: credentials.elevenlabs_agent_id,
      from_number: fromNumber,
      to_number: toNumber,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": credentials.elevenlabs_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("ElevenLabs call timed out after 30s");
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs call failed (${response.status}): ${error}`);
  }

  const json = await response.json();

  // ElevenLabs returns 200 OK with {success:false, message, conversation_id}
  // when the call reached their infra but SIP failed (e.g. 480 phone off, 486 busy).
  // Surface these as SIPInitiationError so callers can classify by SIP code.
  if (json.success === false) {
    const convId = json.conversation_id || null;
    const msg = json.message || "ElevenLabs returned success=false";
    throw new SIPInitiationError(msg, convId, parseSipCode(msg));
  }

  return json;
}
