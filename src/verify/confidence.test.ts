import { describe, it, expect } from "vitest";
import { scoreConfidence, deriveSignals } from "./confidence.js";
import type { Claim, DuneResultRef, ScrapeResult } from "../types.js";

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

describe("deriveSignals", () => {
  const dune: DuneResultRef[] = [{ queryId: 42, rows: [{ tvl: 1 }], executedAt: "2026-06-16T00:00:00Z" }];
  const asOf = "2026-06-17";

  it("scores an all-dune, fresh, multi-source claim highest", () => {
    const claim: Claim = {
      id: "c", text: "t", forwardLooking: false,
      metrics: [
        { label: "Q1", value: 1, provenance: { kind: "dune", queryId: 42, column: "tvl", row: 0 } },
        { label: "Q2", value: 2, provenance: { kind: "dune", queryId: 99, column: "tvl", row: 0 } },
      ],
    };
    const s = deriveSignals(claim, [...dune, { queryId: 99, rows: [{ tvl: 2 }], executedAt: "2026-06-16T00:00:00Z" }], [], asOf);
    expect(s.onchainVerified).toBe(true);
    expect(s.sourceQuality).toBe(1);
    expect(s.sourceAgreement).toBe(0.9); // two distinct sources
    expect(s.freshness).toBeGreaterThan(0.9); // 1 day old
  });

  it("derives weaker signals for a forward-looking claim with no metrics", () => {
    const claim: Claim = { id: "f", text: "may grow", forwardLooking: true, metrics: [] };
    const s = deriveSignals(claim, dune, [], asOf);
    expect(s.onchainVerified).toBe(false);
    expect(s.sourceQuality).toBeLessThan(0.5);
    expect(s.sourceAgreement).toBeLessThan(0.5);
  });

  it("decays freshness toward 0 as the backing data ages past the window", () => {
    const stale: DuneResultRef[] = [{ queryId: 42, rows: [{ tvl: 1 }], executedAt: "2026-04-01T00:00:00Z" }];
    const claim: Claim = {
      id: "c", text: "t", forwardLooking: false,
      metrics: [{ label: "Q1", value: 1, provenance: { kind: "dune", queryId: 42, column: "tvl", row: 0 } }],
    };
    const s = deriveSignals(claim, stale, [], asOf);
    expect(s.freshness).toBe(0);
  });

  it("treats an allowlisted scrape as a real but lower-quality source", () => {
    const scrapes: ScrapeResult[] = [
      { url: "https://defillama.com/chain/Mantle", domain: "defillama.com", text: "x", scrapedAt: "2026-06-16T00:00:00Z" },
    ];
    const claim: Claim = {
      id: "s", text: "t", forwardLooking: false,
      metrics: [{ label: "RWA", value: 1, provenance: { kind: "scrape", domain: "defillama.com", url: "https://defillama.com/chain/Mantle", scrapedAt: "2026-06-16T00:00:00Z", scope: "mantle-specific", figure: "1" } }],
    };
    const s = deriveSignals(claim, [], scrapes, asOf);
    expect(s.onchainVerified).toBe(false);
    expect(s.sourceQuality).toBe(0.7);
    expect(s.freshness).toBeGreaterThan(0.9);
  });
});
