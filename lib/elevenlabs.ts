interface AgentCredentials {
  elevenlabs_api_key: string;
  elevenlabs_agent_id: string;
  telephony_provider: "twilio" | "didww";
  elevenlabs_phone_number_id?: string | null;
  didww_phone_number?: string | null;
  outbound_caller_id?: string | null;
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": credentials.elevenlabs_api_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs call failed (${response.status}): ${error}`);
  }

  return await response.json();
}
