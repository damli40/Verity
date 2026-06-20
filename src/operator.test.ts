import { describe, it, expect, vi } from "vitest";
import { runResearch } from "./operator.js";
import type { Report, DuneResultRef, AllowlistEntry, ScrapeResult, SourceAllowlistEntry } from "./types.js";

const allowlist: AllowlistEntry[] = [
  { name: "X", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, category: "tokenized-treasuries", status: "verified", provenance: "t" },
];
const dune: DuneResultRef[] = [{ queryId: 42, rows: [{ tvl_usd: 247_500_000 }], executedAt: "2026-06-16T00:00:00Z" }];
const report: Report = {
  question: "q", asOf: "2026-06-16",
  claims: [{ id: "c1", text: "TVL $247.5M", forwardLooking: false,
    metrics: [{ label: "TVL", value: 247_500_000, address: "0xAbC0000000000000000000000000000000000001",
      provenance: { kind: "dune", queryId: 42, column: "tvl_usd", row: 0 } }] }],
};

const deps = {
  onchain: vi.fn(async () => dune),
  web: vi.fn(async () => [{ title: "t", url: "https://x.com/a", snippet: "s" }]),
  synthesize: vi.fn(async () => ({ report: structuredClone(report), tokens: 0 })),
  judge: vi.fn(async () => ({ passed: true, notes: "ok" })),
  renderPdf: vi.fn(async () => "examples/out.pdf"),
  attest: vi.fn(async () => "0xtx"),
  telemetry: { runCompleted: vi.fn(), flush: vi.fn() },
};

describe("runResearch", () => {
  it("produces a pdf + attestation when the gate passes", async () => {
    const out = await runResearch(
      { question: "q", entities: ["X"], queryIds: [42], allowlist, now: "2026-06-17" },
      deps as any,
    );
    expect(out.passed).toBe(true);
    expect(out.pdfPath).toBe("examples/out.pdf");
    expect(out.attestationTx).toBe("0xtx");
    expect(deps.attest).toHaveBeenCalledOnce();
    expect(deps.telemetry.runCompleted).toHaveBeenCalledOnce();
  });

  it("passes only entity-resolved allowlisted addresses to the synthesizer", async () => {
    const spy = vi.fn(async () => ({ report: structuredClone(report), tokens: 0 }));
    const localDeps = { ...deps, synthesize: spy };
    await runResearch(
      { question: "q", entities: ["X"], queryIds: [42], allowlist, now: "2026-06-17" },
      localDeps as any,
    );
    expect((spy.mock.calls[0] as any[])[3]).toEqual(["0xAbC0000000000000000000000000000000000001"]);

    const spy2 = vi.fn(async () => ({ report: structuredClone(report), tokens: 0 }));
    await runResearch(
      { question: "q", entities: ["Unknown"], queryIds: [42], allowlist, now: "2026-06-17" },
      { ...deps, synthesize: spy2 } as any,
    );
    expect((spy2.mock.calls[0] as any[])[3]).toEqual([]);
  });

  it("does NOT render or attest when the gate fails", async () => {
    const badDeps = { ...deps, renderPdf: vi.fn(), attest: vi.fn(),
      synthesize: vi.fn(async () => { const r = structuredClone(report); r.claims[0].metrics[0].value = 1; return { report: r, tokens: 0 }; }) };
    const out = await runResearch(
      { question: "q", entities: ["X"], queryIds: [42], allowlist, now: "2026-06-17" },
      badDeps as any,
    );
    expect(out.passed).toBe(false);
    expect(badDeps.renderPdf).not.toHaveBeenCalled();
    expect(badDeps.attest).not.toHaveBeenCalled();
  });
});

describe("runResearch — v2 wiring", () => {
  it("passes a corroborated scrape claim and tags its tier 'corroborated'", async () => {
    const scrapes: ScrapeResult[] = [
      { url: "https://defillama.com/chain/Mantle", domain: "defillama.com",
        text: "Mantle RWA total value is $241,080,948.", scrapedAt: "2026-06-19T00:00:00Z" },
    ];
    const sourceAllowlist: SourceAllowlistEntry[] = [{ domain: "defillama.com", roles: ["corroboration"] }];
    const scrapeReport: Report = {
      question: "q", asOf: "2026-06-19",
      claims: [{ id: "s1", text: "Mantle RWA total is $241,080,948", forwardLooking: false,
        metrics: [{ label: "Mantle RWA total", value: 241_080_948,
          provenance: { kind: "scrape", domain: "defillama.com", url: "https://defillama.com/chain/Mantle",
            scrapedAt: "2026-06-19T00:00:00Z", scope: "mantle-specific", figure: "$241,080,948" } }] }],
    };
    let renderedReport: Report | undefined;
    const out = await runResearch(
      { question: "q", entities: [], queryIds: [], allowlist: [], now: "2026-06-19", sourceAllowlist },
      {
        onchain: async () => [],
        web: async () => [],
        scrape: async () => scrapes,
        synthesize: async () => ({ report: structuredClone(scrapeReport), tokens: 0 }),
        judge: async () => ({ passed: true, notes: "ok" }),
        renderPdf: async (r: Report) => { renderedReport = r; return "out.pdf"; },
        attest: async () => "0xtx",
        telemetry: { runCompleted: () => {}, flush: () => {} },
      } as any,
    );
    expect(out.passed).toBe(true);
    expect(renderedReport?.claims[0].tier).toBe("corroborated");
  });

  it("runs discovery and returns the DiscoveryResult", async () => {
    const discovered = { verified: [], quarantined: [{ name: "Ghost", issuer: "", category: "other" as const, networks: ["Mantle"] }] };
    const out = await runResearch(
      { question: "q", entities: [], queryIds: [], allowlist: [], now: "2026-06-19" },
      {
        onchain: async () => [],
        web: async () => [],
        discover: async () => discovered,
        synthesize: async () => ({ report: { question: "q", asOf: "2026-06-19",
          claims: [{ id: "f1", text: "Ghost may grow", forwardLooking: true, metrics: [] }] }, tokens: 0 }),
        judge: async () => ({ passed: true, notes: "ok" }),
        renderPdf: async () => "out.pdf",
        attest: async () => "0xtx",
        telemetry: { runCompleted: () => {}, flush: () => {} },
      } as any,
    );
    expect(out.passed).toBe(true);
    expect(out.discovered).toEqual(discovered);
  });
});
