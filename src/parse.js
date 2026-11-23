// Turn a critic's score cell into a number.
// "93" -> 93, "93I" -> 93 (Wine Advocate maturity letter), "90-92R" -> 91 (range midpoint),
// "NT" / "NV" / "NR" / "" -> null (not rated / not declared).
export function parseScore(text) {
  const m = /^\s*(\d{2,3})(?:\s*[-–]\s*(\d{2,3}))?/.exec(String(text ?? ''));
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] ? Number(m[2]) : lo;
  const v = (lo + hi) / 2;
  return v >= 50 && v <= 100 ? v : null;
}

export function parseYear(text) {
  const m = /^\s*((?:19|20)\d{2})\s*$/.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}
