import { describe, it, expect, vi } from "vitest";
import { runResearch } from "./operator.js";
import type { Report, DuneResultRef, AllowlistEntry } from "./types.js";

const allowlist: AllowlistEntry[] = [
  { name: "X", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, provenance: "t" },
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
  synthesize: vi.fn(async () => structuredClone(report)),
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

  it("does NOT render or attest when the gate fails", async () => {
    const badDeps = { ...deps, renderPdf: vi.fn(), attest: vi.fn(),
      synthesize: vi.fn(async () => { const r = structuredClone(report); r.claims[0].metrics[0].value = 1; return r; }) };
    const out = await runResearch(
      { question: "q", entities: ["X"], queryIds: [42], allowlist, now: "2026-06-17" },
      badDeps as any,
    );
    expect(out.passed).toBe(false);
    expect(badDeps.renderPdf).not.toHaveBeenCalled();
    expect(badDeps.attest).not.toHaveBeenCalled();
  });
});
