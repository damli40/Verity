import { describe, it, expect } from "vitest";
import { runGate } from "./gate.js";
import type { Report, DuneResultRef, AllowlistEntry, ScrapeResult, SourceAllowlistEntry } from "../types.js";

const allowlist: AllowlistEntry[] = [
  { name: "X", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, category: "tokenized-treasuries", status: "verified", provenance: "t" },
];
const dune: DuneResultRef[] = [{ queryId: 42, rows: [{ tvl_usd: 247_500_000 }], executedAt: "2026-06-16T00:00:00Z" }];
const goodReport: Report = {
  question: "q", asOf: "2026-06-16",
  claims: [{
    id: "c1", text: "TVL is $247.5M", forwardLooking: false,
    metrics: [{ label: "TVL", value: 247_500_000, address: "0xAbC0000000000000000000000000000000000001",
      provenance: { kind: "dune", queryId: 42, column: "tvl_usd", row: 0 } }],
  }],
};

describe("runGate", () => {
  it("blocks when deterministic checks fail, without calling the judge", async () => {
    const bad = structuredClone(goodReport);
    bad.claims[0].metrics[0].value = 1; // mismatch
    const judgeFn = async () => ({ passed: true, notes: "" });
    const r = await runGate(bad, dune, allowlist, "2026-06-17", judgeFn);
    expect(r.passed).toBe(false);
    expect(r.stage).toBe("deterministic");
  });

  it("passes only when both deterministic and judge pass", async () => {
    const judgeFn = async () => ({ passed: true, notes: "ok" });
    const r = await runGate(goodReport, dune, allowlist, "2026-06-17", judgeFn);
    expect(r.passed).toBe(true);
  });

  it("blocks when judge rejects even if deterministic passes", async () => {
    const judgeFn = async () => ({ passed: false, notes: "incoherent" });
    const r = await runGate(goodReport, dune, allowlist, "2026-06-17", judgeFn);
    expect(r.passed).toBe(false);
    expect(r.stage).toBe("qualitative");
  });

  it("admits a corroborated scrape claim through the deterministic stage", async () => {
    const scrapes: ScrapeResult[] = [
      { url: "https://defillama.com/chain/Mantle", domain: "defillama.com",
        text: "Mantle RWA total value is $241,080,948.", scrapedAt: "2026-06-17T00:00:00Z" },
    ];
    const srcAllow: SourceAllowlistEntry[] = [{ domain: "defillama.com", roles: ["corroboration"] }];
    const report: Report = { question: "q", asOf: "2026-06-18",
      claims: [{ id: "s1", text: "Mantle RWA total is $241,080,948", forwardLooking: false,
        metrics: [{ label: "Mantle RWA total", value: 241_080_948,
          provenance: { kind: "scrape", domain: "defillama.com", url: "https://defillama.com/chain/Mantle",
            scrapedAt: "2026-06-17T00:00:00Z", scope: "mantle-specific", figure: "$241,080,948" } }] }] };
    const judgeFn = async () => ({ passed: true, notes: "ok" });
    const r = await runGate(report, [], [], "2026-06-18", judgeFn, scrapes, srcAllow);
    expect(r.passed).toBe(true);
  });
});
