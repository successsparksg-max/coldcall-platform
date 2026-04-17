import { defineHook } from "workflow";

/**
 * Fired by the ElevenLabs webhook handler when a call completes.
 * Token: the ElevenLabs conversation_id — same value used by the workflow
 * when creating the hook, and by the webhook handler when resuming it.
 */
export const callCompletedHook = defineHook<{
  conversationId: string;
  status?: string;
  transcriptText?: string;
  durationSecs?: number;
  cost?: number;
  recordingUrl?: string;
}>();
