const POLICY_TYPES = [
  "Life",
  "Health",
  "Motor",
  "Travel",
  "Property",
  "Group",
  "General",
  "Other",
] as const;

const PREFERRED_TIMES = [
  "Morning",
  "Afternoon",
  "Evening",
  "Any",
] as const;

const LANGUAGES = [
  "English",
  "Mandarin",
  "Malay",
  "Tamil",
  "Hindi",
  "Other",
] as const;

export function normalizePhone(raw: string): {
  normalized: string | null;
  error: string | null;
} {
  const cleaned = raw.toString().replace(/[\s\-\(\)\.]/g, "");

  if (!/^\+?\d{7,15}$/.test(cleaned))
    return { normalized: null, error: `Invalid phone format: ${raw}` };

  // Singapore local: 8 digits starting with 8 or 9
  if (/^[89]\d{7}$/.test(cleaned))
    return { normalized: `+65${cleaned}`, error: null };

  // Already has + prefix
  if (cleaned.startsWith("+"))
    return { normalized: cleaned, error: null };

  // Bare digits >= 10 chars — likely missing +
  if (cleaned.length >= 10)
    return { normalized: `+${cleaned}`, error: null };

  return {
    normalized: null,
    error: `Cannot determine country code for: ${raw}`,
  };
}

export function validatePolicyType(
  value: string | undefined | null
): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const match = POLICY_TYPES.find(
    (p) => p.toLowerCase() === v.toLowerCase()
  );
  return match || null;
}

export function validatePreferredTime(
  value: string | undefined | null
): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const match = PREFERRED_TIMES.find(
    (p) => p.toLowerCase() === v.toLowerCase()
  );
  return match || null;
}

export function validateLanguage(
  value: string | undefined | null
): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const match = LANGUAGES.find(
    (p) => p.toLowerCase() === v.toLowerCase()
  );
  return match || null;
}
