import { inngest } from "./client";
import { db, withRetry } from "@/lib/db";
import { calls, callEntries, callLists } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { ANALYSIS_PROMPT } from "@/lib/analysis-prompt";
import { decrypt } from "@/lib/encryption";
import { generateText } from "ai";

export const analyzeCallTranscript = inngest.createFunction(
  { id: "analyze-call-transcript", retries: 2 },
  { event: "call/analyze-transcript" },
  async ({ event, step }) => {
    const {
      conversationId,
      transcriptText: initialTranscriptText,
      recordingUrl,
      elevenlabsApiKeyEncrypted,
    } = event.data;

    // If webhook didn't include a transcript, fetch it directly from EL.
    const transcriptText = await step.run("resolve-transcript", async () => {
      if (initialTranscriptText && initialTranscriptText.trim().length > 0) {
        return initialTranscriptText;
      }
      if (!elevenlabsApiKeyEncrypted) {
        console.warn(
          `[analyze] No transcript in event and no API key — analyzing empty transcript for ${conversationId}`
        );
        return "";
      }
      try {
        const apiKey = decrypt(elevenlabsApiKeyEncrypted);
        const res = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
          { headers: { "xi-api-key": apiKey } }
        );
        if (!res.ok) {
          console.warn(
            `[analyze] EL fetch failed for ${conversationId}: HTTP ${res.status}`
          );
          return "";
        }
        const j = (await res.json()) as {
          transcript?: Array<{ role?: string; message?: string }>;
        };
        const arr = Array.isArray(j.transcript) ? j.transcript : [];
        return arr
          .filter((e) => e?.role && e?.message)
          .map((e) => `${e.role}: ${e.message}`)
          .join("\n");
      } catch (e) {
        console.error(`[analyze] EL fallback fetch errored:`, e);
        return "";
      }
    });

    const analysis = await step.run("llm-analysis", async () => {
      if (!transcriptText || transcriptText.trim().length === 0) {
        // No transcript at all → mark as voicemail to drive reclassification.
        return JSON.stringify({
          rating: 1,
          summary: "No transcript available — call had no usable conversation.",
          email: null,
          user_name: null,
          booking_status: "FALSE",
          booking_location: null,
          booking_date: null,
          booking_time: null,
          estimated_cost: 0,
          is_voicemail: true,
        });
      }
      const { text } = await generateText({
        model: process.env.AI_MODEL || "deepseek/deepseek-v3.2",
        prompt: `${ANALYSIS_PROMPT}\n\nTranscript:\n${transcriptText}`,
        temperature: 0,
      });
      return text || "{}";
    });

    const cleaned = await step.run("clean-analysis", async () => {
      try {
        const parsed = JSON.parse(
          analysis.replace(/```json|```/g, "").trim()
        );

        // Validate email
        if (parsed.email) {
          const email = parsed.email.toLowerCase().trim();
          parsed.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            ? email
            : null;
        }

        // Clamp rating 1-5
        parsed.rating = Math.max(
          1,
          Math.min(5, parseInt(parsed.rating) || 1)
        );

        // Normalize booking_status
        parsed.booking_status = ["TRUE", "FALSE"].includes(
          String(parsed.booking_status).toUpperCase()
        )
          ? String(parsed.booking_status).toUpperCase()
          : "FALSE";

        // Clean estimated_cost
        if (parsed.estimated_cost != null) {
          parsed.estimated_cost =
            Math.round(Number(parsed.estimated_cost) * 100) / 100;
          if (isNaN(parsed.estimated_cost)) parsed.estimated_cost = null;
        }

        // Clean booking fields
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
    });

    await step.run("store-analysis", async () => {
      await withRetry(() => db
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

      // If voicemail detected, reclassify the call entry as no_answer
      if (cleaned.is_voicemail) {
        const [callRecord] = await db
          .select({ callEntryId: calls.callEntryId })
          .from(calls)
          .where(eq(calls.conversationId, conversationId))
          .limit(1);

        if (callRecord?.callEntryId) {
          // Get current entry status
          const [entry] = await db
            .select({ callStatus: callEntries.callStatus, callListId: callEntries.callListId })
            .from(callEntries)
            .where(eq(callEntries.id, callRecord.callEntryId))
            .limit(1);

          if (entry && entry.callStatus === "answered") {
            await db
              .update(callEntries)
              .set({ callStatus: "no_answer", updatedAt: new Date() })
              .where(eq(callEntries.id, callRecord.callEntryId));

            // Adjust list counters: -1 answered, +1 no_answer
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
    });
  }
);
