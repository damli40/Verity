import type { ConfidenceSignals } from "../types.js";

/**
 * Maps concrete signals to a 0..100 confidence score. Weights are explicit and auditable
 * (no model involved): onchain-verified data is the strongest signal, then source quality,
 * agreement, and freshness.
 */
export function scoreConfidence(s: ConfidenceSignals): number {
  const weighted =
    0.30 * s.sourceQuality +
    0.25 * s.sourceAgreement +
    0.20 * s.freshness +
    0.25 * (s.onchainVerified ? 1 : 0);
  return Math.max(0, Math.min(100, Math.round(weighted * 100)));
}
