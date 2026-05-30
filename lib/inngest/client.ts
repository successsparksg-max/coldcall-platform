import { Inngest } from "inngest";

type Events = {
  "calllist/start": {
    data: {
      callListId: string;
      agentId: string;
      botCredentialIds?: string[];
      // Epoch ms when the current continuous-calling window began. Threaded
      // through chunk handoffs so the rest-break clock survives fresh runs.
      callingSessionStartedAt?: number;
    };
  };
  "calllist/cancel": {
    data: { callListId: string };
  };
  "elevenlabs/call-completed": {
    data: { conversation_id: string };
  };
  "call/analyze-transcript": {
    data: {
      conversationId: string;
      transcriptText: string;
      callDurationSecs: number;
      cost: number;
      recordingUrl: string;
      // Encrypted EL API key for fallback fetch when webhook payload lacks transcript
      elevenlabsApiKeyEncrypted?: string;
    };
  };
};

export const inngest = new Inngest({
  id: "coldcall-platform",
});

// Re-export Events type for use in functions
export type { Events };
