import type { Claim, ClaimTier } from "../types.js";

/**
 * Deterministic tier for a claim that has already passed the gate.
 * - forward-looking: no numeric metrics.
 * - verified: every numeric metric is a recomputable Dune cell.
 * - corroborated: relies on at least one allowlisted scrape figure.
 */
export function deriveTier(claim: Claim): ClaimTier {
  if (claim.metrics.length === 0) return "forward-looking";
  const allDune = claim.metrics.every((m) => m.provenance?.kind === "dune");
  return allDune ? "verified" : "corroborated";
}
