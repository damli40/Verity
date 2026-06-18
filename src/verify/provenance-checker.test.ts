import { describe, it, expect } from "vitest";
import { checkProvenance } from "./provenance-checker.js";
import type { Report, DuneResultRef, AllowlistEntry, ScrapeResult, SourceAllowlistEntry, Metric } from "../types.js";

const allowlist: AllowlistEntry[] = [
  { name: "X", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, category: "tokenized-treasuries", status: "verified", provenance: "test" },
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

const sourceAllowlist: SourceAllowlistEntry[] = [
  { domain: "defillama.com", roles: ["discovery", "corroboration"] },
  { domain: "app.rwa.xyz", roles: ["discovery"] },
];
const scrapes: ScrapeResult[] = [
  {
    url: "https://defillama.com/chain/Mantle",
    domain: "defillama.com",
    text: "Mantle RWA total value is $241,080,948 across 160 assets.",
    scrapedAt: "2026-06-17T00:00:00Z",
  },
];
function scrapeReport(over: Partial<Metric> = {}): Report {
  return {
    question: "q",
    asOf: "2026-06-18",
    claims: [
      {
        id: "s1",
        text: "Mantle RWA total is $241,080,948",
        forwardLooking: false,
        metrics: [
          {
            label: "Mantle RWA total",
            value: 241_080_948,
            provenance: {
              kind: "scrape",
              domain: "defillama.com",
              url: "https://defillama.com/chain/Mantle",
              scrapedAt: "2026-06-17T00:00:00Z",
              scope: "mantle-specific",
              figure: "$241,080,948",
            },
            ...over,
          },
        ],
      },
    ],
  };
}

describe("checkProvenance — scrape (corroborated) tier", () => {
  it("passes when figure is in fresh scrape, domain corroborates, value matches", () => {
    const r = checkProvenance(scrapeReport(), [], [], "2026-06-18", scrapes, sourceAllowlist);
    expect(r.passed).toBe(true);
  });
  it("rejects when the figure string is absent from the scraped text", () => {
    const report = scrapeReport();
    report.claims[0].metrics[0].value = 999_999;
    (report.claims[0].metrics[0].provenance as { figure: string }).figure = "$999,999";
    const r = checkProvenance(report, [], [], "2026-06-18", scrapes, sourceAllowlist);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => /not found in scraped page text/.test(f.reason))).toBe(true);
  });
  it("rejects when the domain lacks the corroboration role", () => {
    const report = scrapeReport();
    (report.claims[0].metrics[0].provenance as { domain: string; url: string }).domain = "app.rwa.xyz";
    (report.claims[0].metrics[0].provenance as { domain: string; url: string }).url = "https://app.rwa.xyz/networks";
    const r = checkProvenance(report, [], [], "2026-06-18", scrapes, sourceAllowlist);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => /not allowed to corroborate/.test(f.reason))).toBe(true);
  });
  it("rejects when the scrape is stale (older than the freshness window)", () => {
    const old = [{ ...scrapes[0], scrapedAt: "2026-01-01T00:00:00Z" }];
    const r = checkProvenance(scrapeReport(), [], [], "2026-06-18", old, sourceAllowlist);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => /stale scrape/.test(f.reason))).toBe(true);
  });
  it("rejects when the parsed figure does not equal the claimed value", () => {
    const report = scrapeReport();
    report.claims[0].metrics[0].value = 241_000_000; // figure says 241,080,948
    const r = checkProvenance(report, [], [], "2026-06-18", scrapes, sourceAllowlist);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => /does not equal claimed value/.test(f.reason))).toBe(true);
  });
});

describe("checkProvenance — global-vs-Mantle accuracy rule", () => {
  const globalScrapes: ScrapeResult[] = [
    {
      url: "https://defillama.com/x",
      domain: "defillama.com",
      text: "USDY global AUM is $2.15B.",
      scrapedAt: "2026-06-17T00:00:00Z",
    },
  ];
  function globalReport(label: string): Report {
    return {
      question: "q",
      asOf: "2026-06-18",
      claims: [
        {
          id: "g1",
          text: "USDY AUM is $2.15B",
          forwardLooking: false,
          metrics: [
            {
              label,
              value: 2_150_000_000,
              provenance: {
                kind: "scrape",
                domain: "defillama.com",
                url: "https://defillama.com/x",
                scrapedAt: "2026-06-17T00:00:00Z",
                scope: "global",
                figure: "$2.15B",
              },
            },
          ],
        },
      ],
    };
  }
  it("rejects a global figure that is NOT labeled 'global'", () => {
    const r = checkProvenance(globalReport("USDY AUM"), [], [], "2026-06-18", globalScrapes, sourceAllowlist);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => /global figure must be labeled/.test(f.reason))).toBe(true);
  });
  it("accepts a global figure when labeled 'global'", () => {
    const r = checkProvenance(globalReport("USDY global AUM (all networks)"), [], [], "2026-06-18", globalScrapes, sourceAllowlist);
    expect(r.passed).toBe(true);
  });
});
