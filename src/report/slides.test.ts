import { describe, it, expect } from "vitest";
import { buildDeck } from "./slides.js";
import type { Report } from "../types.js";

const meta = { attestationTx: "0xtx", cost: { estimateUsd: 0.2, actualUsd: 0.18, timeSavedHours: 4 } };
const report: Report = {
  question: "Did Mantle RWA growth accelerate in Q2 2026?",
  asOf: "2026-06-17",
  claims: [
    { id: "c1", text: "RWA TVL reached $247.5M (+27%).", forwardLooking: false, tier: "verified",
      category: "tokenized-treasuries",
      metrics: [{ label: "Q1 2026 TVL", value: 195_000_000, provenance: { kind: "dune", queryId: 42, column: "tvl", row: 0 } },
                { label: "Q2 2026 TVL", value: 247_500_000, provenance: { kind: "dune", queryId: 42, column: "tvl", row: 1 } }] },
    { id: "c2", text: "InsightX may drive future adoption.", forwardLooking: true, tier: "forward-looking", metrics: [] },
  ],
};

describe("buildDeck", () => {
  it("opens with a cover carrying the question and date", () => {
    const slides = buildDeck(report, meta);
    expect(slides[0]).toEqual({ kind: "cover", title: report.question, asOf: "2026-06-17" });
  });
  it("emits a TOC with Roman numerals for each present category", () => {
    const toc = buildDeck(report, meta).find((s) => s.kind === "toc");
    expect(toc).toBeTruthy();
    if (toc?.kind === "toc") {
      expect(toc.sections.map((x) => x.numeral)).toEqual(["I", "II"]);
      expect(toc.sections.map((x) => x.category)).toEqual(["tokenized-treasuries", "other"]);
    }
  });
  it("emits one divider per category and content slides with tier + dune caption + line chart", () => {
    const slides = buildDeck(report, meta);
    expect(slides.filter((s) => s.kind === "divider")).toHaveLength(2);
    const content = slides.find((s) => s.kind === "content");
    if (content?.kind === "content") {
      expect(content.tier).toBe("verified");
      expect(content.sourceCaption).toBe("Dune #42");
      expect(content.chart?.type).toBe("line");
    }
  });
  it("ends with a sources appendix listing the re-runnable Dune id", () => {
    const slides = buildDeck(report, meta);
    const last = slides[slides.length - 1];
    expect(last.kind).toBe("appendix");
    if (last.kind === "appendix") {
      expect(last.sources.some((s) => s.label === "Dune #42")).toBe(true);
    }
  });
});
