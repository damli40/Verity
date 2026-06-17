import { describe, it, expect } from "vitest";
import { scoreConfidence } from "./confidence.js";

describe("scoreConfidence", () => {
  it("returns high confidence for strong, fresh, onchain-verified signals", () => {
    const score = scoreConfidence({ sourceQuality: 1, sourceAgreement: 1, freshness: 1, onchainVerified: true });
    expect(score).toBeGreaterThanOrEqual(95);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns lower confidence for weak, unverified signals", () => {
    const score = scoreConfidence({ sourceQuality: 0.4, sourceAgreement: 0.3, freshness: 0.5, onchainVerified: false });
    expect(score).toBeLessThan(70);
  });

  it("never exceeds 100 or drops below 0", () => {
    const hi = scoreConfidence({ sourceQuality: 1, sourceAgreement: 1, freshness: 1, onchainVerified: true });
    const lo = scoreConfidence({ sourceQuality: 0, sourceAgreement: 0, freshness: 0, onchainVerified: false });
    expect(hi).toBeLessThanOrEqual(100);
    expect(lo).toBeGreaterThanOrEqual(0);
  });
});
