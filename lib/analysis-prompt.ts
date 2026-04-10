export const ANALYSIS_PROMPT = `You will receive a conversation transcript between a user and an AI agent.
Analyse very carefully and extract the following fields and return ONLY a valid JSON object:

{
  "rating": integer (1 to 5),
  "summary": string,
  "email": string or null,
  "user_name": string or null,
  "booking_status": "TRUE" or "FALSE",
  "booking_location": string or null,
  "booking_date": string or null,
  "booking_time": string or null,
  "estimated_cost": number,
  "is_voicemail": boolean
}

CRITICAL RULES — DO NOT HALLUCINATE:
- ONLY extract information that is EXPLICITLY stated in the transcript.
- If a name is not clearly spoken in the transcript, set user_name to null. Do NOT invent names like "John" or "John Doe".
- If no specific insurance product is mentioned, do NOT assume or guess one. Write the summary based only on what was actually discussed.
- The summary must strictly reflect what happened in the conversation. Do NOT add details, topics, or products that were not mentioned.
- If the conversation is short or vague, write a short summary. Do NOT pad it with assumed context.
- If no email was given, set email to null. Do NOT guess emails.
- If no cost was discussed, set estimated_cost to 0. Do NOT estimate or make up costs.

Voicemail detection:
Set is_voicemail to true if the call went to a voicemail/answering machine. Signs include:
- Automated greeting ("Please leave a message after the beep", "is not available", "cannot take your call")
- Only one side talking (the AI agent speaks but no real human responds)
- Very short call with no meaningful human interaction
- Standard carrier/phone voicemail messages
Set is_voicemail to false if a real person answered and had a conversation.

Rating scale:
1 = Poor: Did not understand or help, not answering
2 = Not interested
3 = Average: Somewhat helpful but with gaps
4 = Interested but did not book a meeting
5 = Excellent: Handled the call smoothly, followed intent clearly

Extract email ONLY if user explicitly provided one in the transcript. Email should be valid format or null.
Extract the user's name ONLY if they clearly stated it during the conversation. Set to null otherwise.
Set booking_status to "TRUE" only if the user explicitly agreed to schedule a meeting/appointment.
If a meeting was booked, extract:
- booking_location: the agreed meeting place (e.g. "Tampines Mall", "Office", "Zoom") or null
- booking_date: the agreed date (e.g. "Thursday", "2026-03-20", "next Monday") or null
- booking_time: the agreed time (e.g. "7 PM", "14:00", "morning") or null
estimated_cost should be the cost ONLY if a specific number was mentioned in the transcript, otherwise 0.

Return ONLY the JSON object, no markdown, no explanation.`;
