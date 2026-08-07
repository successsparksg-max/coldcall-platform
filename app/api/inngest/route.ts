import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { executeCallList } from "@/lib/inngest/execute-calls";
import { analyzeCallTranscript } from "@/lib/inngest/analyze-transcript";

// Give each Inngest step invocation the full Vercel serverless window so a
// long step (place-batch, auto-sync) cannot get 504'd mid-flight.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executeCallList, analyzeCallTranscript],
  // Stream keepalive frames so the Vercel gateway does not hang up during
  // long-running steps — required Inngest pattern on Vercel.
  streaming: "allow",
});
