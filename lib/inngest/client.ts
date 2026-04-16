import { Inngest } from "inngest";

type Events = {
  "calllist/start": {
    data: { callListId: string; agentId: string; botCredentialIds?: string[] };
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
    };
  };
};

export const inngest = new Inngest({
  id: "coldcall-platform",
});

// Re-export Events type for use in functions
export type { Events };
