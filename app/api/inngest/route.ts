import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { executeCallList } from "@/lib/inngest/execute-calls";
import { analyzeCallTranscript } from "@/lib/inngest/analyze-transcript";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executeCallList, analyzeCallTranscript],
});
