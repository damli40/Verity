import type { RawCandidate } from "./registry-scout.js";

/**
 * Map one extracted registry row into a RawCandidate. Tolerant of missing fields and of `networks`
 * being either an array or a singular `network` string. The actual extraction call (Firecrawl) lives in
 * the CLI composition root; this pure mapper is what we unit-test.
 */
export function toRawCandidate(row: Record<string, unknown>, sourceUrl: string): RawCandidate {
  const networks = Array.isArray(row.networks)
    ? (row.networks as unknown[]).map(String)
    : typeof row.network === "string"
      ? [row.network]
      : [];
  return {
    name: typeof row.name === "string" ? row.name : undefined,
    issuer: typeof row.issuer === "string" ? row.issuer : undefined,
    category: typeof row.category === "string" ? row.category : undefined,
    networks,
    claimedAddress: typeof row.address === "string" ? row.address : undefined,
    sourceUrl,
  };
}
