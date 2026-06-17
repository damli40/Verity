import { describe, it, expect } from "vitest";
import { buildSynthesisPrompt } from "./synthesizer.js";
import type { DuneResultRef } from "./types.js";
import type { WebSource } from "./scouts/web-scout.js";

describe("buildSynthesisPrompt", () => {
  const dune: DuneResultRef[] = [{ queryId: 42, rows: [{ tvl_usd: 247_500_000 }], executedAt: "2026-06-16T00:00:00Z" }];
  const web: WebSource[] = [{ title: "t", url: "https://x.com/a", snippet: "s" }];

  it("includes the question, dune query IDs, and web URLs", () => {
    const p = buildSynthesisPrompt("Did RWA growth accelerate?", dune, web, ["0xAbC0000000000000000000000000000000000001"]);
    expect(p).toContain("Did RWA growth accelerate?");
    expect(p).toContain("42");
    expect(p).toContain("https://x.com/a");
    expect(p).toContain("0xAbC0000000000000000000000000000000000001");
  });

  it("instructs that every numeric metric must carry a dune provenance ref", () => {
    const p = buildSynthesisPrompt("q", dune, web, []);
    expect(p.toLowerCase()).toContain("provenance");
    expect(p.toLowerCase()).toContain("queryid");
  });
});
