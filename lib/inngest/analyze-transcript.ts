import { inngest } from "./client";
import { db } from "@/lib/db";
import { calls } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { ANALYSIS_PROMPT } from "@/lib/analysis-prompt";

export const analyzeCallTranscript = inngest.createFunction(
  { id: "analyze-call-transcript", retries: 2 },
  { event: "call/analyze-transcript" },
  async ({ event, step }) => {
    const { conversationId, transcriptText, recordingUrl } = event.data;

    const analysis = await step.run("llm-analysis", async () => {
      const model = process.env.AI_MODEL || "deepseek/deepseek-v3.2";
      const response = await fetch(
        "https://gateway.vercel.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.VERCEL_AI_GATEWAY_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: `${ANALYSIS_PROMPT}\n\nTranscript:\n${transcriptText}`,
              },
            ],
            temperature: 0,
          }),
        }
      );
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "{}";
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

        return parsed;
      } catch {
        return {
          rating: 1,
          summary: "Error parsing AI response",
          email: null,
          user_name: null,
          booking_status: "FALSE",
          estimated_cost: null,
        };
      }
    });

    await step.run("store-analysis", async () => {
      await db
        .update(calls)
        .set({
          rating: cleaned.rating,
          summary: cleaned.summary,
          email: cleaned.email,
          name: cleaned.user_name,
          bookingStatus: cleaned.booking_status,
          estimatedCost: cleaned.estimated_cost?.toString() || null,
          transcript: transcriptText,
          recordingUrl: recordingUrl,
        })
        .where(eq(calls.conversationId, conversationId));
    });
  }
);
