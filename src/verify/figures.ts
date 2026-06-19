/**
 * Parse a human-written figure ("$247.5M", "241,080,948", "3.55", "0") to a number.
 * Returns null if the string is not a clean numeric figure. Used to check a model-declared
 * scrape `figure` against the claimed metric value — strictly, with no fuzzy tolerance.
 */
export function parseFigure(s: string): number | null {
  const m = s.trim().replace(/\$/g, "").replace(/,/g, "").match(/^(-?\d+(?:\.\d+)?)\s*([kmbKMB])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const suffix = (m[2] ?? "").toLowerCase();
  const mult = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
  return n * mult;
}
