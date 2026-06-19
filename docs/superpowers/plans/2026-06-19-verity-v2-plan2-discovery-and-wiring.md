# Verity v2 — Plan 2: Discovery + Operator/CLI Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Verity v2's verification foundation *live* — add a registry-cross-reference discovery stage and scrape capture, and wire scrapes + the source allowlist + post-gate tier derivation through the operator and CLI so a real run exercises the two-tier (Verified / Corroborated) gate.

**Architecture:** Additive and backward-compatible. Two new pure-core discovery modules (`registry-scout`, `match-onchain`) with injected fetch/lookup; a scrape-capture scout that returns full-page `ScrapeResult[]` for corroboration. The operator gains *optional* `scrape` + `discover` deps and an optional `sourceAllowlist` input (defaults preserve v1 Dune-only behavior), threads scrapes + source allowlist into `runGate`, and attaches `deriveTier` to each claim after the gate passes. The CLI opts in: it loads `data/source-allowlist.json`, captures corroboration scrapes, runs discovery, and the fixture path serves cached scrapes + discovery so the offline demo stays key-free and hash-recomputable.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), `tsx` to run, `vitest` to test, `node --env-file=.env` for scripts. Scrape fetch via the project's existing web stack (Firecrawl/`fetch`), injected.

## Global Constraints

- Cardinal Rule: the LLM never validates a number; discovery never auto-promotes a candidate to `verified`. Addresses come only from the hand-verified contract allowlist; off-list ⇒ quarantined (mentionable, never numerically cited).
- Trust = re-runnable Dune query IDs + recomputable PDF hash; the ERC-8004 tx only anchors/timestamps. Never imply otherwise.
- TDD: failing test → run fail → minimal impl → run pass → commit. One behavior per test.
- ESM only; import sibling modules with explicit `.js` suffix (e.g. `from "./match-onchain.js"`).
- All external I/O injected; pure functions stay network-free. The `--fixture` path must never hit the network and must render a recomputable-hash PDF with zero keys.
- Backward compatibility: existing **62/62** tests and the `--fixture` render must remain green after every task. New operator deps/input fields are optional with safe defaults.
- Scope: Mantle RWA only. No multi-chain, no non-RWA topics.

---

### Task 1: Registry discovery scout

**Files:**
- Create: `src/discovery/registry-scout.ts`
- Modify: `src/types.ts` (add `RwaCandidate`)
- Test: `src/discovery/registry-scout.test.ts`

**Interfaces:**
- Consumes: `RwaCategory` (existing in `src/types.ts`).
- Produces:
  - `interface RwaCandidate { name: string; issuer: string; category: RwaCategory; networks: string[] }` (in `types.ts`).
  - `interface RawCandidate { name?: string; issuer?: string; category?: string; networks?: string[] }` (in `registry-scout.ts`).
  - `parseCandidates(raw: RawCandidate[]): RwaCandidate[]` — pure; keeps only rows whose `networks` include "Mantle" (case-insensitive), coerces an unknown/missing `category` to `"other"`, defaults missing `issuer`/`name` to `""`, drops rows with no `name`, dedupes by lowercased `name` (first wins).
  - `runRegistryScout(fetchCandidates: (domain: string) => Promise<RawCandidate[]>, domains: string[]): Promise<RwaCandidate[]>` — fetches each discovery domain, flattens, then `parseCandidates`.

- [ ] **Step 1: Add the `RwaCandidate` type**

In `src/types.ts`, after the `ScrapeResult` interface (around line 34), add:

```ts
/** A candidate RWA asset discovered from a registry, before on-chain matching. */
export interface RwaCandidate {
  name: string;
  issuer: string;
  category: RwaCategory;
  networks: string[];
}
```

- [ ] **Step 2: Write the failing test**

Create `src/discovery/registry-scout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCandidates, runRegistryScout, type RawCandidate } from "./registry-scout.js";

describe("parseCandidates", () => {
  it("keeps Mantle rows, coerces unknown category, defaults issuer, dedupes by name", () => {
    const raw: RawCandidate[] = [
      { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Ethereum", "Mantle"] },
      { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Mantle"] }, // dup
      { name: "MI4", category: "wildcard-thing", networks: ["mantle"] }, // unknown cat → other, missing issuer
      { name: "OffChainOnly", issuer: "X", category: "index-fund", networks: ["Ethereum"] }, // not Mantle → dropped
      { issuer: "NoName", category: "other", networks: ["Mantle"] }, // no name → dropped
    ];
    const out = parseCandidates(raw);
    expect(out).toEqual([
      { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Ethereum", "Mantle"] },
      { name: "MI4", issuer: "", category: "other", networks: ["mantle"] },
    ]);
  });
});

describe("runRegistryScout", () => {
  it("fetches each domain, flattens, and parses", async () => {
    const byDomain: Record<string, RawCandidate[]> = {
      "defillama.com": [{ name: "Syrup USDT", issuer: "Maple", category: "private-credit", networks: ["Mantle"] }],
      "messari.io": [{ name: "xTSLA", issuer: "Backed", category: "tokenized-equities", networks: ["Mantle"] }],
    };
    const out = await runRegistryScout(async (d) => byDomain[d] ?? [], ["defillama.com", "messari.io"]);
    expect(out.map((c) => c.name)).toEqual(["Syrup USDT", "xTSLA"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/discovery/registry-scout.test.ts`
Expected: FAIL — cannot find module `./registry-scout.js`.

- [ ] **Step 4: Write the implementation**

Create `src/discovery/registry-scout.ts`:

```ts
import type { RwaCandidate, RwaCategory } from "../types.js";

/** A raw row as pulled from a discovery registry, before normalization. */
export interface RawCandidate {
  name?: string;
  issuer?: string;
  category?: string;
  networks?: string[];
}

const CATEGORIES: RwaCategory[] = [
  "tokenized-treasuries",
  "tokenized-equities",
  "index-fund",
  "private-credit",
  "commodities",
  "real-estate",
  "other",
];

function coerceCategory(c: string | undefined): RwaCategory {
  return (CATEGORIES as string[]).includes(c ?? "") ? (c as RwaCategory) : "other";
}

function onMantle(networks: string[] | undefined): boolean {
  return (networks ?? []).some((n) => n.toLowerCase() === "mantle");
}

/**
 * Normalize raw registry rows into Mantle-only RWA candidates.
 * Pure: drops non-Mantle rows and rows without a name, coerces unknown categories to "other",
 * defaults missing issuer to "", and dedupes by lowercased name (first occurrence wins).
 */
export function parseCandidates(raw: RawCandidate[]): RwaCandidate[] {
  const out: RwaCandidate[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r.name || !onMantle(r.networks)) continue;
    const key = r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: r.name,
      issuer: r.issuer ?? "",
      category: coerceCategory(r.category),
      networks: r.networks ?? [],
    });
  }
  return out;
}

/** Fetch discovery-role domains (injected) and normalize to candidates. */
export async function runRegistryScout(
  fetchCandidates: (domain: string) => Promise<RawCandidate[]>,
  domains: string[],
): Promise<RwaCandidate[]> {
  const pages = await Promise.all(domains.map((d) => fetchCandidates(d)));
  return parseCandidates(pages.flat());
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/discovery/registry-scout.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/discovery/registry-scout.ts src/discovery/registry-scout.test.ts src/types.ts
git commit -m "feat(discovery): registry scout — normalize Mantle RWA candidates"
```

---

### Task 2: Match candidates on-chain (verify vs quarantine)

**Files:**
- Create: `src/discovery/match-onchain.ts`
- Test: `src/discovery/match-onchain.test.ts`

**Interfaces:**
- Consumes: `RwaCandidate` (Task 1), `AllowlistEntry` (existing).
- Produces:
  - `interface DiscoveryResult { verified: AllowlistEntry[]; quarantined: RwaCandidate[] }`
  - `matchOnchain(candidates: RwaCandidate[], allowlist: AllowlistEntry[], lookup: (c: RwaCandidate) => string | null): DiscoveryResult` — pure given an injected `lookup`. For each candidate, `lookup` returns its on-chain Mantle address or `null`. A candidate is `verified` **only** if `lookup` returns an address that matches (case-insensitive) an allowlist entry whose `status === "verified"`; that allowlist entry is pushed to `verified`. Everything else (no address, or address not on the verified allowlist) goes to `quarantined`. Never mutates the allowlist; never promotes.

- [ ] **Step 1: Write the failing test**

Create `src/discovery/match-onchain.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchOnchain } from "./match-onchain.js";
import type { AllowlistEntry, RwaCandidate } from "../types.js";

const allowlist: AllowlistEntry[] = [
  { name: "USDY", address: "0x5bE26527e817998A7206475496fDE1E68957c5A6", chainId: 5000,
    category: "tokenized-treasuries", status: "verified", provenance: "Ondo docs" },
];
const cand = (name: string, category: RwaCandidate["category"] = "other"): RwaCandidate =>
  ({ name, issuer: "x", category, networks: ["Mantle"] });

describe("matchOnchain", () => {
  it("marks a candidate verified when its on-chain address is on the verified allowlist (case-insensitive)", () => {
    const lookup = () => "0x5be26527e817998a7206475496fde1e68957c5a6"; // lowercased on purpose
    const r = matchOnchain([cand("USDY", "tokenized-treasuries")], allowlist, lookup);
    expect(r.verified.map((e) => e.name)).toEqual(["USDY"]);
    expect(r.quarantined).toEqual([]);
  });
  it("quarantines a candidate that resolves to an off-allowlist address", () => {
    const lookup = () => "0xdeadbeef00000000000000000000000000000000";
    const r = matchOnchain([cand("MysteryRWA")], allowlist, lookup);
    expect(r.verified).toEqual([]);
    expect(r.quarantined.map((c) => c.name)).toEqual(["MysteryRWA"]);
  });
  it("quarantines a candidate that does not resolve on-chain (null)", () => {
    const r = matchOnchain([cand("Ghost")], allowlist, () => null);
    expect(r.verified).toEqual([]);
    expect(r.quarantined.map((c) => c.name)).toEqual(["Ghost"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/discovery/match-onchain.test.ts`
Expected: FAIL — cannot find module `./match-onchain.js`.

- [ ] **Step 3: Write the implementation**

Create `src/discovery/match-onchain.ts`:

```ts
import type { AllowlistEntry, RwaCandidate } from "../types.js";

export interface DiscoveryResult {
  verified: AllowlistEntry[];
  quarantined: RwaCandidate[];
}

/**
 * Cross-reference discovered candidates against the hand-verified contract allowlist.
 * `lookup` (injected) resolves a candidate to its on-chain Mantle address, or null.
 * A candidate is `verified` ONLY when its resolved address matches a `status: "verified"`
 * allowlist entry. Everything else is quarantined — mentionable, never numerically cited.
 * Never promotes a candidate to the allowlist (human-in-loop, per spec §5/§9).
 */
export function matchOnchain(
  candidates: RwaCandidate[],
  allowlist: AllowlistEntry[],
  lookup: (c: RwaCandidate) => string | null,
): DiscoveryResult {
  const verifiedByAddr = new Map(
    allowlist.filter((e) => e.status === "verified").map((e) => [e.address.toLowerCase(), e]),
  );
  const verified: AllowlistEntry[] = [];
  const quarantined: RwaCandidate[] = [];
  for (const c of candidates) {
    const addr = lookup(c);
    const match = addr ? verifiedByAddr.get(addr.toLowerCase()) : undefined;
    if (match) verified.push(match);
    else quarantined.push(c);
  }
  return { verified, quarantined };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/discovery/match-onchain.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/discovery/match-onchain.ts src/discovery/match-onchain.test.ts
git commit -m "feat(discovery): match candidates on-chain — verified vs quarantined"
```

---

### Task 3: Scrape-capture scout (corroboration pages)

**Files:**
- Create: `src/scouts/scrape-scout.ts`
- Test: `src/scouts/scrape-scout.test.ts`

**Interfaces:**
- Consumes: `ScrapeResult` (existing in `src/types.ts`).
- Produces:
  - `interface ScrapeTarget { url: string; domain: string }`
  - `captureScrapes(targets: ScrapeTarget[], fetchText: (url: string) => Promise<string>, now: string): Promise<ScrapeResult[]>` — for each target, fetch full page text (injected) and stamp `scrapedAt = now`. Returns one `ScrapeResult` per target. This is the full-text capture the corroboration gate string-matches against (distinct from the Exa snippet `web` scout).

- [ ] **Step 1: Write the failing test**

Create `src/scouts/scrape-scout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { captureScrapes } from "./scrape-scout.js";

describe("captureScrapes", () => {
  it("captures full page text per target and stamps scrapedAt", async () => {
    const fetchText = async (url: string) =>
      url.includes("Mantle") ? "Mantle RWA total value is $241,080,948." : "other";
    const out = await captureScrapes(
      [{ url: "https://defillama.com/chain/Mantle", domain: "defillama.com" }],
      fetchText,
      "2026-06-19T00:00:00Z",
    );
    expect(out).toEqual([
      {
        url: "https://defillama.com/chain/Mantle",
        domain: "defillama.com",
        text: "Mantle RWA total value is $241,080,948.",
        scrapedAt: "2026-06-19T00:00:00Z",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scouts/scrape-scout.test.ts`
Expected: FAIL — cannot find module `./scrape-scout.js`.

- [ ] **Step 3: Write the implementation**

Create `src/scouts/scrape-scout.ts`:

```ts
import type { ScrapeResult } from "../types.js";

export interface ScrapeTarget {
  url: string;
  domain: string;
}

/**
 * Capture full page text for each corroboration target (injected `fetchText`), stamping the
 * capture time. The corroboration gate string-matches model-declared figures against this text,
 * so we keep the whole page, not an Exa snippet. `now` is the run's asOf-aligned timestamp.
 */
export async function captureScrapes(
  targets: ScrapeTarget[],
  fetchText: (url: string) => Promise<string>,
  now: string,
): Promise<ScrapeResult[]> {
  return Promise.all(
    targets.map(async (t) => ({ url: t.url, domain: t.domain, text: await fetchText(t.url), scrapedAt: now })),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/scouts/scrape-scout.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/scouts/scrape-scout.ts src/scouts/scrape-scout.test.ts
git commit -m "feat(scouts): scrape-capture scout for corroboration page text"
```

---

### Task 4: Wire scrapes, discovery, and tier into the operator

**Files:**
- Modify: `src/operator.ts`
- Test: `src/operator.test.ts` (append cases)

**Interfaces:**
- Consumes: `runGate` (now accepts `scrapes`, `sourceAllowlist`), `deriveTier` (`src/verify/tier.js`), `DiscoveryResult` (Task 2), `ScrapeResult`/`SourceAllowlistEntry` (existing types).
- Produces: extended `ResearchInput`, `ResearchDeps`, `ResearchOutput`:
  - `ResearchInput` += `sourceAllowlist?: SourceAllowlistEntry[]` (default `[]`).
  - `ResearchDeps` += `scrape?: () => Promise<ScrapeResult[]>` and `discover?: () => Promise<DiscoveryResult>` (both optional; absent ⇒ v1 behavior).
  - `ResearchOutput` += `discovered?: DiscoveryResult`.
  - After a passing gate, each `report.claims[i].tier` is set via `deriveTier`.

- [ ] **Step 1: Write the failing tests**

First read `src/operator.test.ts` to match its existing `makeDeps`/`baseInput` style. Then append (adjust the helper names to whatever the file already uses; the assertions below are what must hold):

```ts
import type { ScrapeResult, SourceAllowlistEntry, Report } from "./types.js";

describe("runResearch — v2 wiring", () => {
  it("passes a corroborated scrape claim and tags its tier 'corroborated'", async () => {
    const scrapes: ScrapeResult[] = [
      { url: "https://defillama.com/chain/Mantle", domain: "defillama.com",
        text: "Mantle RWA total value is $241,080,948.", scrapedAt: "2026-06-19T00:00:00Z" },
    ];
    const sourceAllowlist: SourceAllowlistEntry[] = [{ domain: "defillama.com", roles: ["corroboration"] }];
    const report: Report = {
      question: "q", asOf: "2026-06-19",
      claims: [{ id: "s1", text: "Mantle RWA total is $241,080,948", forwardLooking: false,
        metrics: [{ label: "Mantle RWA total", value: 241_080_948,
          provenance: { kind: "scrape", domain: "defillama.com", url: "https://defillama.com/chain/Mantle",
            scrapedAt: "2026-06-19T00:00:00Z", scope: "mantle-specific", figure: "$241,080,948" } }] }],
    };
    let rendered = false;
    const out = await runResearch(
      { question: "q", entities: [], queryIds: [], allowlist: [], now: "2026-06-19",
        sourceAllowlist },
      {
        onchain: async () => [],
        web: async () => [],
        scrape: async () => scrapes,
        synthesize: async () => structuredClone(report),
        judge: async () => ({ passed: true, notes: "ok" }),
        renderPdf: async () => { rendered = true; return "out.pdf"; },
        attest: async () => "0xtx",
        telemetry: { runCompleted: () => {}, flush: () => {} },
      },
    );
    expect(out.passed).toBe(true);
    expect(rendered).toBe(true);
    // tier was attached after the gate passed
    // (re-run synth returns a fresh clone each call, so assert via the rendered report instead:)
  });

  it("runs discovery and returns the DiscoveryResult", async () => {
    const discovered = { verified: [], quarantined: [{ name: "Ghost", issuer: "", category: "other" as const, networks: ["Mantle"] }] };
    const out = await runResearch(
      { question: "q", entities: [], queryIds: [], allowlist: [], now: "2026-06-19" },
      {
        onchain: async () => [],
        web: async () => [],
        discover: async () => discovered,
        synthesize: async () => ({ question: "q", asOf: "2026-06-19",
          claims: [{ id: "f1", text: "Ghost may grow", forwardLooking: true, metrics: [] }] }),
        judge: async () => ({ passed: true, notes: "ok" }),
        renderPdf: async () => "out.pdf",
        attest: async () => "0xtx",
        telemetry: { runCompleted: () => {}, flush: () => {} },
      },
    );
    expect(out.passed).toBe(true);
    expect(out.discovered).toEqual(discovered);
  });
});
```

To make the tier assertion observable, capture the report in `renderPdf`. Replace the first test's `renderPdf` and final assertions with:

```ts
    let renderedReport: Report | undefined;
    const out = await runResearch(
      { question: "q", entities: [], queryIds: [], allowlist: [], now: "2026-06-19", sourceAllowlist },
      {
        onchain: async () => [],
        web: async () => [],
        scrape: async () => scrapes,
        synthesize: async () => structuredClone(report),
        judge: async () => ({ passed: true, notes: "ok" }),
        renderPdf: async (r) => { renderedReport = r; return "out.pdf"; },
        attest: async () => "0xtx",
        telemetry: { runCompleted: () => {}, flush: () => {} },
      },
    );
    expect(out.passed).toBe(true);
    expect(renderedReport?.claims[0].tier).toBe("corroborated");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/operator.test.ts`
Expected: FAIL — `sourceAllowlist`/`scrape`/`discover`/`discovered` not recognized; tier undefined; corroborated claim rejected by the gate (no scrapes threaded).

- [ ] **Step 3: Implement the wiring**

In `src/operator.ts`:

Add imports:

```ts
import type { ScrapeResult, SourceAllowlistEntry } from "./types.js";
import type { DiscoveryResult } from "./discovery/match-onchain.js";
import { deriveTier } from "./verify/tier.js";
```

Extend the interfaces:

```ts
export interface ResearchInput {
  question: string;
  entities: string[];
  queryIds: number[];
  allowlist: AllowlistEntry[];
  now: string;
  sourceAllowlist?: SourceAllowlistEntry[];
}

export interface ResearchDeps {
  onchain: (queryIds: number[]) => Promise<DuneResultRef[]>;
  web: (q: string) => Promise<WebSource[]>;
  scrape?: () => Promise<ScrapeResult[]>;
  discover?: () => Promise<DiscoveryResult>;
  synthesize: (q: string, dune: DuneResultRef[], web: WebSource[], addrs: string[]) => Promise<Report>;
  judge: (r: Report) => Promise<JudgeVerdict>;
  renderPdf: (r: Report, meta: { attestationTx: string; cost: { estimateUsd: number; actualUsd: number; timeSavedHours: number } }) => Promise<string>;
  attest: (pdfPath: string) => Promise<string>;
  telemetry: { runCompleted: (m: any) => void; flush: () => Promise<void> | void };
}

export interface ResearchOutput {
  passed: boolean;
  pdfPath?: string;
  attestationTx?: string;
  discovered?: DiscoveryResult;
  failures?: unknown;
}
```

In `runResearch`, replace the scout/gate section. The current body is:

```ts
  const started = Date.now();
  const addrs = resolveTargets(input.entities, input.allowlist).map((t) => t.address);

  const [dune, web] = await Promise.all([deps.onchain(input.queryIds), deps.web(input.question)]);
  const report = await deps.synthesize(input.question, dune, web, addrs);
```

Replace it with (adds discovery + scrape capture in parallel):

```ts
  const started = Date.now();
  const addrs = resolveTargets(input.entities, input.allowlist).map((t) => t.address);

  const [dune, web, scrapes, discovered] = await Promise.all([
    deps.onchain(input.queryIds),
    deps.web(input.question),
    deps.scrape ? deps.scrape() : Promise.resolve([] as ScrapeResult[]),
    deps.discover ? deps.discover() : Promise.resolve(undefined),
  ]);
  const report = await deps.synthesize(input.question, dune, web, addrs);
```

Change the gate call from:

```ts
  const gate = await runGate(report, dune, input.allowlist, input.now, deps.judge);
```

to:

```ts
  const gate = await runGate(report, dune, input.allowlist, input.now, deps.judge, scrapes, input.sourceAllowlist ?? []);
```

In the gate-fail early return, include `discovered`:

```ts
    return { passed: false, discovered, failures: gate.failures.length ? gate.failures : gate.judgeNotes };
```

After the gate passes (immediately before the `const cost = ...` line), attach the deterministic tier to every claim:

```ts
  // Gate passed → every numeric metric is valid; derive each claim's trust tier for the report.
  for (const c of report.claims) c.tier = deriveTier(c);
```

In the success return, include `discovered`:

```ts
  return { passed: true, pdfPath, attestationTx, discovered };
```

- [ ] **Step 4: Run the full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass (existing 62 + 2 new operator cases); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/operator.ts src/operator.test.ts
git commit -m "feat(operator): thread scrapes + discovery + post-gate tier derivation"
```

---

### Task 5: Wire the CLI (live + fixture) and cache fixture scrapes/discovery

**Files:**
- Modify: `src/cli.ts`
- Modify: `fixtures/mantle-rwa-q2-2026.json` (add `scrapes` + `discovered`)
- Test: none new — verified by the offline `--fixture` run + full suite + tsc.

**Interfaces:**
- Consumes: `loadSourceAllowlist` (`src/verify/source-allowlist.js`), `captureScrapes` (Task 3), `runRegistryScout` (Task 1), `matchOnchain` (Task 2), extended operator (Task 4).
- Produces: a CLI whose **fixture** path serves cached `scrapes` + `discovered` (zero keys, offline) and whose **live** path captures corroboration scrapes + runs discovery against the source/contract allowlists.

- [ ] **Step 1: Add cached scrapes + discovery to the fixture**

Read `fixtures/mantle-rwa-q2-2026.json` first to match its existing key style. Add two top-level keys (do not remove existing ones):

```json
  "scrapes": [
    {
      "url": "https://defillama.com/chain/Mantle",
      "domain": "defillama.com",
      "text": "Mantle RWA Active Mcap is $238,950,000 across tokenized treasuries, equities and credit.",
      "scrapedAt": "2026-06-19T00:00:00Z"
    }
  ],
  "discovered": {
    "verified": [],
    "quarantined": [
      { "name": "MI4", "issuer": "Securitize", "category": "index-fund", "networks": ["Mantle"] }
    ]
  }
```

> The fixture's curated `report.json` keeps its existing Dune-backed claims, so the offline gate still passes deterministically. These cached `scrapes`/`discovered` are served to the operator so the v2 path is exercised offline without changing the curated report's pass/fail outcome.

- [ ] **Step 2: Wire the fixture branch of the CLI**

In `src/cli.ts`, add imports near the existing ones:

```ts
import { loadSourceAllowlist } from "./verify/source-allowlist.js";
import { captureScrapes } from "./scouts/scrape-scout.js";
import { runRegistryScout, type RawCandidate } from "./discovery/registry-scout.js";
import { matchOnchain } from "./discovery/match-onchain.js";
```

In the `if (fixtureMode) { ... }` block, after the existing `fx`/`allowlist`/`fixtureReport` reads, add:

```ts
    const sourceAllowlist = loadSourceAllowlist("data/source-allowlist.json");
```

Add two deps to the fixture `deps` object (alongside `onchain`/`web`):

```ts
      scrape: async () => fx.scrapes ?? [],
      discover: async () => fx.discovered ?? { verified: [], quarantined: [] },
```

Add `sourceAllowlist` to the fixture `runResearch` input object:

```ts
      { question: fx.question, entities: ["USDY", "mUSD"], queryIds: fx.queryIds, allowlist, now: fx.now, sourceAllowlist },
```

(Also fix the stale `entities: ["SPCXx", "InsightX"]` to `["USDY", "mUSD"]` — those fictional entities were dropped in the production run; the fixture allowlist resolves by name so unknown entities just yield no addrs, but keep it consistent with the real allowlist.)

- [ ] **Step 3: Wire the live branch of the CLI**

In the live (non-fixture) section of `main()`, after `const allowlist = loadAllowlist("data/allowlist.json");` add:

```ts
  const sourceAllowlist = loadSourceAllowlist("data/source-allowlist.json");
  const scrapeTargets = (process.env.VERITY_SCRAPE_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url) => ({ url, domain: new URL(url).hostname.replace(/^www\./, "") }));
  const discoveryDomains = sourceAllowlist
    .filter((s) => s.roles.includes("discovery"))
    .map((s) => s.domain);
```

Add `scrape` + `discover` to the live `deps` object (alongside `onchain`/`web`). Use the project's web fetch for page text and a conservative discovery that resolves nothing on-chain yet (so every discovered candidate is quarantined until a real on-chain resolver is wired — never auto-promote):

```ts
    scrape: () =>
      captureScrapes(
        scrapeTargets,
        async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`scrape failed: ${url} ${res.status}`);
          return res.text();
        },
        new Date().toISOString(),
      ),
    discover: async () => {
      const fetchCandidates = async (domain: string): Promise<RawCandidate[]> => {
        // Discovery fetch is registry-specific and not yet automated; return none until a
        // per-registry parser is added. Quarantine-by-default keeps the Cardinal Rule intact.
        void domain;
        return [];
      };
      const candidates = await runRegistryScout(fetchCandidates, discoveryDomains);
      return matchOnchain(candidates, allowlist, () => null);
    },
```

Add `sourceAllowlist` to the live `runResearch` input object:

```ts
    { question, entities: ["USDY", "mUSD"], queryIds, allowlist, now: new Date().toISOString().slice(0, 10), sourceAllowlist },
```

- [ ] **Step 4: Verify offline fixture run + full suite + typecheck**

Run:
```bash
npx tsc --noEmit && npx vitest run && node --import tsx src/cli.ts --fixture
```
Expected: tsc clean; all tests pass; the fixture run prints `"passed": true` with a `pdfPath`, a `simulated-0x…` attestation, and a `discovered` object. No network calls, no API keys.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts fixtures/mantle-rwa-q2-2026.json
git commit -m "feat(cli): wire source allowlist, scrape capture + discovery (live + fixture)"
```

---

## Self-Review

**Spec coverage (`2026-06-18-verity-v2-mantle-rwa-specialist-design.md`):**
- §2 DISCOVER stage (registry-scout → match-onchain) → Tasks 1–2. ✓
- §2 SCOUT web scrape capture → Task 3. ✓
- §2/§4 two-tier gate threaded live (scrapes + source allowlist) → Task 4. ✓
- §3 `src/discovery/registry-scout.ts`, `src/discovery/match-onchain.ts` → Tasks 1–2. ✓
- §4 `Claim.tier` attached deterministically after gate → Task 4. ✓
- §5 discovery never auto-promotes; quarantine-by-default → Tasks 2 + 5. ✓
- §7 `RwaCandidate` type → Task 1. ✓
- §8 operator integration (gate-pass ⇒ renderPdf+attest; discovery runs) + offline `--fixture` render with zero keys → Tasks 4–5. ✓

**Deferred to Plan 3 (intentional, not gaps):** the deck/report engine (`theme.ts`, `slides.ts`, `render-deck.ts`, `charts.ts`, landscape `generate-pdf.ts`) — Plan 2 keeps the existing `render-html.ts` renderer so the pipeline stays green; the new `tier`/`category`/`discovered` data is now available for Plan 3 to render. The `Slide` union type lands in Plan 3.

**Accepted follow-ups (non-blocking):** `src/cache/` TTL layer from spec §3 is deferred — freshness is already enforced deterministically in the checker (45-day window), so an explicit cache is speculative for a one-shot CLI (YAGNI); revisit if repeated runs need result reuse. The live `discover` fetch returns no candidates until per-registry parsers are written (quarantine-by-default), and `scrape` targets come from `VERITY_SCRAPE_URLS` until automated; both are honest, Cardinal-Rule-safe stubs that the offline fixture fully exercises.

**Placeholder scan:** none — every code/test step has literal content.

**Type consistency:** `RwaCandidate {name,issuer,category,networks}` is identical in Tasks 1, 2, 5; `DiscoveryResult {verified,quarantined}` identical in Tasks 2, 4, 5; `matchOnchain(candidates, allowlist, lookup)` and `captureScrapes(targets, fetchText, now)` and `runRegistryScout(fetchCandidates, domains)` signatures match across their definition and call sites; `runGate(..., scrapes, sourceAllowlist)` and `deriveTier(claim)` match the Plan 1 signatures already in the codebase.
```
