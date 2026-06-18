import { describe, it, expect } from "vitest";
import { checkProvenance } from "./provenance-checker.js";
import type { Report, DuneResultRef, AllowlistEntry } from "../types.js";

const allowlist: AllowlistEntry[] = [
  { name: "X", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, provenance: "test" },
];

const dune: DuneResultRef[] = [
  { queryId: 42, rows: [{ tvl_usd: 247_500_000 }], executedAt: "2026-06-16T00:00:00Z" },
];

function baseReport(): Report {
  return {
    question: "q",
    asOf: "2026-06-15",
    claims: [
      {
        id: "c1",
        text: "RWA TVL reached $247.5M",
        forwardLooking: false,
        metrics: [
          {
            label: "RWA TVL",
            value: 247_500_000,
            address: "0xAbC0000000000000000000000000000000000001",
            provenance: { kind: "dune", queryId: 42, column: "tvl_usd", row: 0 },
          },
        ],
      },
    ],
  };
}

describe("checkProvenance", () => {
  it("passes when value matches the dune cell and address is allowlisted", () => {
    const r = checkProvenance(baseReport(), dune, allowlist, "2026-06-17");
    expect(r.passed).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it("fails when the asserted value does not equal the dune cell", () => {
    const rep = baseReport();
    rep.claims[0].metrics[0].value = 300_000_000; // planted bad claim
    const r = checkProvenance(rep, dune, allowlist, "2026-06-17");
    expect(r.passed).toBe(false);
    expect(r.failures[0].reason).toMatch(/value mismatch/i);
  });

  it("fails when the referenced dune query is missing", () => {
    const rep = baseReport();
    rep.claims[0].metrics[0].provenance = { kind: "dune", queryId: 999, column: "tvl_usd", row: 0 };
    const r = checkProvenance(rep, dune, allowlist, "2026-06-17");
    expect(r.passed).toBe(false);
    expect(r.failures[0].reason).toMatch(/query .*not found/i);
  });

  it("fails when an address is not on the allowlist", () => {
    const rep = baseReport();
    rep.claims[0].metrics[0].address = "0x00000000000000000000000000000000000000ff";
    const r = checkProvenance(rep, dune, allowlist, "2026-06-17");
    expect(r.passed).toBe(false);
    expect(r.failures[0].reason).toMatch(/not on allowlist/i);
  });

  it("fails when a non-forward-looking claim states a figure with no metric", () => {
    const rep = baseReport();
    rep.claims[0].metrics = [];
    const r = checkProvenance(rep, dune, allowlist, "2026-06-17");
    expect(r.passed).toBe(false);
    expect(r.failures[0].reason).toMatch(/un-sourced figure/i);
  });

  it("fails when a metric has no provenance at all (malformed model output)", () => {
    const rep = baseReport();
    delete (rep.claims[0].metrics[0] as { provenance?: unknown }).provenance;
    const r = checkProvenance(rep, dune, allowlist, "2026-06-17");
    expect(r.passed).toBe(false);
    expect(r.failures[0].reason).toMatch(/no provenance/i);
  });

  it("fails when the dune data is stale relative to asOf", () => {
    const staleDune: DuneResultRef[] = [
      { queryId: 42, rows: [{ tvl_usd: 247_500_000 }], executedAt: "2026-05-01T00:00:00Z" },
    ];
    const r = checkProvenance(baseReport(), staleDune, allowlist, "2026-06-17");
    expect(r.passed).toBe(false);
    expect(r.failures[0].reason).toMatch(/stale|freshness/i);
  });

  it("allows forward-looking claims to contain numbers without a metric", () => {
    const rep = baseReport();
    rep.claims[0] = { id: "c2", text: "InsightX may capture 10% of volume by 2027", forwardLooking: true, metrics: [] };
    const r = checkProvenance(rep, dune, allowlist, "2026-06-17");
    expect(r.passed).toBe(true);
  });
});
