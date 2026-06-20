import { describe, it, expect } from "vitest";
import { renderDeck } from "./render-deck.js";
import type { Report } from "../types.js";

const report: Report = {
  question: "Did Mantle RWA growth accelerate in Q2 2026?",
  asOf: "2026-06-17",
  claims: [
    { id: "c1", text: "RWA TVL reached $247.5M (+27%).", forwardLooking: false, tier: "verified",
      category: "tokenized-treasuries",
      metrics: [{ label: "Q1 2026 TVL", value: 195_000_000, provenance: { kind: "dune", queryId: 42, column: "tvl", row: 0 } },
                { label: "Q2 2026 TVL", value: 247_500_000, provenance: { kind: "dune", queryId: 42, column: "tvl", row: 1 } }] },
  ],
};

describe("renderDeck", () => {
  it("renders a self-contained landscape deck with badges, captions, footer, and charts", () => {
    const html = renderDeck(report, { cost: { estimateUsd: 0.2, actualUsd: 0.18, timeSavedHours: 4 }, anchor: { agentId: "134", registry: "0x8004Cc84", chain: "Mantle mainnet" } });
    expect(html).toContain("Did Mantle RWA growth accelerate in Q2 2026?");
    expect(html).toContain("RWA TVL reached $247.5M");
    expect(html).toContain("Dune #42");                 // source caption
    expect(html).toContain("Verity · Mantle RWA");      // footer brand
    expect(html).toContain("Verified");                 // tier badge label
    expect(html).toContain("requestHash");              // recompute-the-hash verification note
    expect(html).toContain("agentId 134");              // on-chain anchor, NOT the tx
    expect(html).not.toMatch(/tx 0x/);                  // tx is never embedded (would break hash recompute)
    expect(html).toContain("<svg");                     // inline SVG chart panel
    expect(html).toContain("<polyline");                // line chart for the temporal metrics
    expect(html).not.toContain("cdn.jsdelivr.net");     // no CDN
    expect(html).not.toContain("<script");              // no JS — fully static, offline, hash-stable
    expect(html).not.toMatch(/src\s*=/);                // no externally-loaded assets
  });
});
