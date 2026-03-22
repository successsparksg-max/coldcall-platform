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

Extract email if user provided one. Email should be valid format or null.
Extract the user's name if mentioned during the conversation, or null if not mentioned.
Set booking_status to "TRUE" only if the user agreed to schedule a meeting/appointment.
If a meeting was booked, extract:
- booking_location: the agreed meeting place (e.g. "Tampines Mall", "Office", "Zoom") or null
- booking_date: the agreed date (e.g. "Thursday", "2026-03-20", "next Monday") or null
- booking_time: the agreed time (e.g. "7 PM", "14:00", "morning") or null
estimated_cost should be the estimated cost of the insurance product discussed, or 0 if not discussed.

Return ONLY the JSON object, no markdown, no explanation.`;
