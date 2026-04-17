import { db, withRetry } from "@/lib/db";
import { calls, callEntries, callLists } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { ANALYSIS_PROMPT } from "@/lib/analysis-prompt";
import { generateText } from "ai";

interface AnalyzeArgs {
  conversationId: string;
  transcriptText: string;
  callDurationSecs?: number;
  cost?: number;
  recordingUrl: string;
}

interface CleanedAnalysis {
  rating: number;
  summary: string | null;
  email: string | null;
  user_name: string | null;
  booking_status: "TRUE" | "FALSE";
  booking_location: string | null;
  booking_date: string | null;
  booking_time: string | null;
  estimated_cost: number | null;
  is_voicemail: boolean;
}

export async function analyzeCallTranscript(args: AnalyzeArgs) {
  "use workflow";

  const { conversationId, transcriptText, recordingUrl } = args;

  const rawAnalysis = await runLlmAnalysis(transcriptText);
  const cleaned = cleanAnalysis(rawAnalysis);
  await storeAnalysis(
    conversationId,
    transcriptText,
    recordingUrl,
    cleaned
  );
}

// ============================================================
// Steps
// ============================================================

async function runLlmAnalysis(transcriptText: string): Promise<string> {
  "use step";
  const { text } = await generateText({
    model: process.env.AI_MODEL || "deepseek/deepseek-v3.2",
    prompt: `${ANALYSIS_PROMPT}\n\nTranscript:\n${transcriptText}`,
    temperature: 0,
  });
  return text || "{}";
}

// cleanAnalysis doesn't need to be a step — it's pure computation and fast
function cleanAnalysis(raw: string): CleanedAnalysis {
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

    if (parsed.email) {
      const email = parsed.email.toLowerCase().trim();
      parsed.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
    }

    parsed.rating = Math.max(1, Math.min(5, parseInt(parsed.rating) || 1));

    parsed.booking_status = ["TRUE", "FALSE"].includes(
      String(parsed.booking_status).toUpperCase()
    )
      ? String(parsed.booking_status).toUpperCase()
      : "FALSE";

    if (parsed.estimated_cost != null) {
      parsed.estimated_cost =
        Math.round(Number(parsed.estimated_cost) * 100) / 100;
      if (isNaN(parsed.estimated_cost)) parsed.estimated_cost = null;
    }

    parsed.booking_location = parsed.booking_location
      ? String(parsed.booking_location).trim()
      : null;
    parsed.booking_date = parsed.booking_date
      ? String(parsed.booking_date).trim()
      : null;
    parsed.booking_time = parsed.booking_time
      ? String(parsed.booking_time).trim()
      : null;

    return parsed;
  } catch {
    return {
      rating: 1,
      summary: "Error parsing AI response",
      email: null,
      user_name: null,
      booking_status: "FALSE",
      booking_location: null,
      booking_date: null,
      booking_time: null,
      estimated_cost: null,
      is_voicemail: false,
    };
  }
}

async function storeAnalysis(
  conversationId: string,
  transcriptText: string,
  recordingUrl: string,
  cleaned: CleanedAnalysis
) {
  "use step";

  await withRetry(
    () =>
      db
        .update(calls)
        .set({
          rating: cleaned.is_voicemail ? 1 : cleaned.rating,
          summary: cleaned.is_voicemail
            ? `[Voicemail] ${cleaned.summary || "Call went to voicemail"}`
            : cleaned.summary,
          email: cleaned.email,
          name: cleaned.user_name,
          bookingStatus: cleaned.is_voicemail ? "FALSE" : cleaned.booking_status,
          bookingLocation: cleaned.booking_location,
          bookingDate: cleaned.booking_date,
          bookingTime: cleaned.booking_time,
          estimatedCost: cleaned.estimated_cost?.toString() || null,
          transcript: transcriptText,
          recordingUrl: recordingUrl,
        })
        .where(eq(calls.conversationId, conversationId)),
    { label: "store-analysis" }
  );

  // If voicemail, reclassify the call entry as no_answer and adjust list counters
  if (cleaned.is_voicemail) {
    const [callRecord] = await db
      .select({ callEntryId: calls.callEntryId })
      .from(calls)
      .where(eq(calls.conversationId, conversationId))
      .limit(1);

    if (callRecord?.callEntryId) {
      const [entry] = await db
        .select({
          callStatus: callEntries.callStatus,
          callListId: callEntries.callListId,
        })
        .from(callEntries)
        .where(eq(callEntries.id, callRecord.callEntryId))
        .limit(1);

      if (entry && entry.callStatus === "answered") {
        await db
          .update(callEntries)
          .set({ callStatus: "no_answer", updatedAt: new Date() })
          .where(eq(callEntries.id, callRecord.callEntryId));

        await db
          .update(callLists)
          .set({
            callsAnswered: sql`GREATEST(${callLists.callsAnswered} - 1, 0)`,
            callsNoAnswer: sql`${callLists.callsNoAnswer} + 1`,
          })
          .where(eq(callLists.id, entry.callListId));

        console.log(
          `[voicemail] Reclassified entry ${callRecord.callEntryId} from answered → no_answer`
        );
      }
    }
  }
}
