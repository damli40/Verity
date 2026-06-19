import type { AllowlistEntry, RwaCandidate } from "../types.js";

export interface DiscoveryResult {
  verified: AllowlistEntry[];
  quarantined: RwaCandidate[];
}

/**
 * Cross-reference discovered candidates against the hand-verified contract allowlist.
 * `lookup` (injected) resolves a candidate to its on-chain Mantle address, or null.
 * A candidate is `verified` ONLY when its resolved address matches a `status: "verified"`
 * allowlist entry. Everything else is quarantined — mentionable, never numerically cited.
 * Never promotes a candidate to the allowlist (human-in-loop, per spec §5/§9).
 */
export function matchOnchain(
  candidates: RwaCandidate[],
  allowlist: AllowlistEntry[],
  lookup: (c: RwaCandidate) => string | null,
): DiscoveryResult {
  const verifiedByAddr = new Map(
    allowlist.filter((e) => e.status === "verified").map((e) => [e.address.toLowerCase(), e]),
  );
  const verified: AllowlistEntry[] = [];
  const quarantined: RwaCandidate[] = [];
  for (const c of candidates) {
    const addr = lookup(c);
    const match = addr ? verifiedByAddr.get(addr.toLowerCase()) : undefined;
    if (match) verified.push(match);
    else quarantined.push(c);
  }
  return { verified, quarantined };
}
