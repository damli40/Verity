import { describe, it, expect } from "vitest";
import { renderReportHtml } from "./render-html.js";
import type { Report } from "../types.js";

const report: Report = {
  question: "Did RWA growth accelerate?",
  asOf: "2026-06-16",
  claims: [{
    id: "c1", text: "RWA TVL reached $247.5M (+27%)", forwardLooking: false, confidence: 98,
    metrics: [{ label: "RWA TVL", value: 247_500_000, address: "0xAbC0000000000000000000000000000000000001",
      provenance: { kind: "dune", queryId: 42, column: "tvl_usd", row: 0 } }],
  }],
};

describe("renderReportHtml", () => {
  it("includes the question, a claim, its confidence, and the dune query id in sources", () => {
    const html = renderReportHtml(report, {
      attestationTx: "0xabc", cost: { estimateUsd: 0.2, actualUsd: 0.18, timeSavedHours: 4 },
    });
    expect(html).toContain("Did RWA growth accelerate?");
    expect(html).toContain("RWA TVL reached $247.5M");
    expect(html).toContain("98");
    expect(html).toContain("42");      // dune query id in sources
    expect(html).toContain("0xabc");   // attestation tx
    expect(html).toContain("cdn.jsdelivr.net/npm/chart.js"); // chart lib included
  });
});
