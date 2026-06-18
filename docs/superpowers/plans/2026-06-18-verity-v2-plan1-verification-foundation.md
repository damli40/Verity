# Verity v2 — Plan 1: Verification Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Verity's deterministic gate with a second admissible trust tier — **Corroborated** (allowlisted, freshly-scraped, strict string-matched figures) — alongside the existing **Verified** (Dune) tier, without weakening the Cardinal Rule.

**Architecture:** Additive, backward-compatible. New data-model fields and the new scrape provenance kind are introduced; `checkProvenance`/`runGate` gain *optional* `scrapes` + `sourceAllowlist` params (default `[]`) so the existing Dune-only pipeline and fixtures stay green. A scrape number is admitted only if its domain has the `corroboration` role, the model-declared `figure` string is literally present in the captured page text, the parsed figure equals the claimed value (no fuzzy tolerance), the scrape is within the freshness window, and a `global`-scope figure is explicitly labeled "global".

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), `tsx` to run, `vitest` to test, `node --env-file=.env` for scripts.

## Global Constraints

- Cardinal Rule: the LLM never validates a number; every check below is pure code. Dune remains the only *recomputable* tier.
- TDD: failing test → run fail → minimal impl → run pass → commit. One behavior per test.
- ESM only; import sibling modules with explicit `.js` suffix (e.g. `from "./figures.js"`).
- Freshness window: **45 days** (`FRESHNESS_WINDOW_DAYS`, already defined in `provenance-checker.ts`).
- Strict string-match: **no numeric tolerance** for scrape figures (float-dust epsilon `< 1` only). Dune keeps its existing `REL_TOLERANCE` 0.5%.
- All external I/O injected; pure functions stay network-free.
- Backward compatibility: existing 45/45 tests and the `--fixture` render must remain green after every task.

---

### Task 1: Data-model deltas

**Files:**
- Modify: `src/types.ts`
- Test: none new (verified by `tsc` + existing suite)

**Interfaces:**
- Consumes: existing `ProvenanceRef`, `Metric`, `Claim`, `AllowlistEntry`, `CheckFailure`.
- Produces:
  - `type RwaCategory = "tokenized-treasuries" | "tokenized-equities" | "index-fund" | "private-credit" | "commodities" | "real-estate" | "other"`
  - `type ClaimTier = "verified" | "corroborated" | "forward-looking"`
  - `type SourceRole = "discovery" | "corroboration"`
  - `interface SourceAllowlistEntry { domain: string; roles: SourceRole[] }`
  - `interface ScrapeResult { url: string; domain: string; text: string; scrapedAt: string }`
  - `ProvenanceRef` adds `{ kind: "scrape"; domain: string; url: string; scrapedAt: string; scope: "global" | "mantle-specific"; figure: string }`
  - `AllowlistEntry` adds `category: RwaCategory; status: "verified" | "quarantined"`
  - `Claim` adds optional `category?: RwaCategory; tier?: ClaimTier`

- [ ] **Step 1: Add the new types and field deltas**

In `src/types.ts`, replace the `ProvenanceRef` union with:

```ts
/** Where a number came from. Dune = recomputable; scrape = corroborated; source = context only. */
export type ProvenanceRef =
  | { kind: "dune"; queryId: number; column: string; row: number }
  | { kind: "scrape"; domain: string; url: string; scrapedAt: string; scope: "global" | "mantle-specific"; figure: string }
  | { kind: "source"; url: string };
```

Add near the top (after `ProvenanceRef`):

```ts
/** RWA asset categories used to group claims and allowlist entries. */
export type RwaCategory =
  | "tokenized-treasuries"
  | "tokenized-equities"
  | "index-fund"
  | "private-credit"
  | "commodities"
  | "real-estate"
  | "other";

/** Trust tier a claim earns after the gate runs. */
export type ClaimTier = "verified" | "corroborated" | "forward-looking";

/** What a web source is trusted to do. */
export type SourceRole = "discovery" | "corroboration";

export interface SourceAllowlistEntry {
  domain: string;
  roles: SourceRole[];
}

/** A page captured this run; the checker string-matches scrape figures against `text`. */
export interface ScrapeResult {
  url: string;
  domain: string;
  text: string;
  scrapedAt: string; // ISO timestamp
}
```

In `interface AllowlistEntry`, add:

```ts
  category: RwaCategory;
  status: "verified" | "quarantined";
```

In `interface Claim`, add (optional — `category` is set by the synthesizer, `tier` post-gate):

```ts
  category?: RwaCategory;
  tier?: ClaimTier;
```

- [ ] **Step 2: Make existing allowlist data satisfy the new required fields**

`AllowlistEntry` now requires `category` + `status`. Update `data/allowlist.json` so both entries validate (USDY/mUSD are real, verified — see prior session):

```json
[
  {
    "name": "USDY",
    "address": "0x5bE26527e817998A7206475496fDE1E68957c5A6",
    "chainId": 5000,
    "category": "tokenized-treasuries",
    "status": "verified",
    "provenance": "Ondo U.S. Dollar Yield (tokenized US Treasuries) on Mantle. docs.ondo.finance/addresses + mantlescan.xyz, 2026-06-18."
  },
  {
    "name": "mUSD",
    "address": "0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3",
    "chainId": 5000,
    "category": "tokenized-treasuries",
    "status": "verified",
    "provenance": "Mantle USD (mUSD), rebasing form of USDY on Mantle. docs.ondo.finance/addresses, 2026-06-18."
  }
]
```

Also update `data/allowlist.fixture.json` entries to add `"category": "tokenized-treasuries", "status": "verified"` to each (keep their existing demo addresses).

- [ ] **Step 3: Verify the project still type-checks and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; **45 passed**. (Optional fields + JSON updates keep everything green.)

- [ ] **Step 4: Commit**

```bash
git add src/types.ts data/allowlist.json data/allowlist.fixture.json
git commit -m "feat(types): add RWA category, claim tier, scrape provenance + source/scrape types"
```

---

### Task 2: Source allowlist loader + roles

**Files:**
- Create: `src/verify/source-allowlist.ts`
- Create: `data/source-allowlist.json`
- Test: `src/verify/source-allowlist.test.ts`

**Interfaces:**
- Consumes: `SourceAllowlistEntry`, `SourceRole` (Task 1).
- Produces:
  - `loadSourceAllowlist(path: string): SourceAllowlistEntry[]`
  - `hasRole(domain: string, role: SourceRole, list: SourceAllowlistEntry[]): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/verify/source-allowlist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadSourceAllowlist, hasRole } from "./source-allowlist.js";

const list = [
  { domain: "app.rwa.xyz", roles: ["discovery"] as const },
  { domain: "defillama.com", roles: ["discovery", "corroboration"] as const },
];

describe("hasRole", () => {
  it("returns true when domain has the role (case-insensitive)", () => {
    expect(hasRole("DefiLlama.com", "corroboration", list)).toBe(true);
  });
  it("returns false when domain lacks the role", () => {
    expect(hasRole("app.rwa.xyz", "corroboration", list)).toBe(false);
  });
  it("returns false for unknown domain", () => {
    expect(hasRole("evil.example", "corroboration", list)).toBe(false);
  });
});

describe("loadSourceAllowlist", () => {
  it("loads the project source allowlist with at least one corroboration domain", () => {
    const l = loadSourceAllowlist("data/source-allowlist.json");
    expect(l.some((e) => e.roles.includes("corroboration"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/source-allowlist.test.ts`
Expected: FAIL — cannot find module `./source-allowlist.js`.

- [ ] **Step 3: Create the data file and the implementation**

Create `data/source-allowlist.json`:

```json
[
  { "domain": "app.rwa.xyz", "roles": ["discovery"] },
  { "domain": "defillama.com", "roles": ["discovery", "corroboration"] },
  { "domain": "messari.io", "roles": ["discovery", "corroboration"] },
  { "domain": "mantle.xyz", "roles": ["corroboration"] },
  { "domain": "docs.ondo.finance", "roles": ["corroboration"] }
]
```

Create `src/verify/source-allowlist.ts`:

```ts
import { readFileSync } from "node:fs";
import type { SourceAllowlistEntry, SourceRole } from "../types.js";

export function loadSourceAllowlist(path: string): SourceAllowlistEntry[] {
  return JSON.parse(readFileSync(path, "utf8")) as SourceAllowlistEntry[];
}

/** True iff `domain` is on the allowlist AND carries `role`. Off-list ⇒ false (mirror of address allowlist). */
export function hasRole(domain: string, role: SourceRole, list: SourceAllowlistEntry[]): boolean {
  const d = domain.toLowerCase();
  return list.some((e) => e.domain.toLowerCase() === d && e.roles.includes(role));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/verify/source-allowlist.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verify/source-allowlist.ts src/verify/source-allowlist.test.ts data/source-allowlist.json
git commit -m "feat(verify): source allowlist loader + role check"
```

---

### Task 3: Figure parsing

**Files:**
- Create: `src/verify/figures.ts`
- Test: `src/verify/figures.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseFigure(s: string): number | null` — parses a human figure string (`$247.5M`, `241,080,948`, `3.55`, `0`) to a number, or `null` if unparseable.

- [ ] **Step 1: Write the failing test**

Create `src/verify/figures.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseFigure } from "./figures.js";

describe("parseFigure", () => {
  it("parses M/B/K suffixes (case-insensitive) with $ and commas", () => {
    expect(parseFigure("$247.5M")).toBe(247_500_000);
    expect(parseFigure("2.15B")).toBe(2_150_000_000);
    expect(parseFigure("$1,234")).toBe(1_234);
    expect(parseFigure("241,080,948")).toBe(241_080_948);
    expect(parseFigure("3.55")).toBe(3.55);
    expect(parseFigure("0")).toBe(0);
  });
  it("returns null for non-numeric strings", () => {
    expect(parseFigure("Daily")).toBeNull();
    expect(parseFigure("")).toBeNull();
    expect(parseFigure("$1.2.3M")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/figures.test.ts`
Expected: FAIL — cannot find module `./figures.js`.

- [ ] **Step 3: Write the implementation**

Create `src/verify/figures.ts`:

```ts
/**
 * Parse a human-written figure ("$247.5M", "241,080,948", "3.55", "0") to a number.
 * Returns null if the string is not a clean numeric figure. Used to check a model-declared
 * scrape `figure` against the claimed metric value — strictly, with no fuzzy tolerance.
 */
export function parseFigure(s: string): number | null {
  const m = s.trim().replace(/\$/g, "").replace(/,/g, "").match(/^(-?\d+(?:\.\d+)?)\s*([kmbKMB])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const suffix = (m[2] ?? "").toLowerCase();
  const mult = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
  return n * mult;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/verify/figures.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verify/figures.ts src/verify/figures.test.ts
git commit -m "feat(verify): strict human-figure parser"
```

---

### Task 4: Scrape provenance check (Corroborated tier)

**Files:**
- Modify: `src/verify/provenance-checker.ts`
- Test: `src/verify/provenance-checker.test.ts` (append cases)

**Interfaces:**
- Consumes: `parseFigure` (Task 3), `hasRole` (Task 2), `ScrapeResult`/`SourceAllowlistEntry` (Task 1), existing `daysBetween`, `FRESHNESS_WINDOW_DAYS`, `CheckFailure`.
- Produces: extended `checkProvenance(report, dune, allowlist, now, scrapes?: ScrapeResult[], sourceAllowlist?: SourceAllowlistEntry[]): CheckResult` — scrape metrics are validated; defaults `[]` keep Dune-only callers unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/verify/provenance-checker.test.ts` (add imports at top if missing: `ScrapeResult`, `SourceAllowlistEntry` from `../types.js`):

```ts
import type { ScrapeResult, SourceAllowlistEntry } from "../types.js";

const sourceAllowlist: SourceAllowlistEntry[] = [
  { domain: "defillama.com", roles: ["discovery", "corroboration"] },
  { domain: "app.rwa.xyz", roles: ["discovery"] },
];
const scrapes: ScrapeResult[] = [
  { url: "https://defillama.com/chain/Mantle", domain: "defillama.com",
    text: "Mantle RWA total value is $241,080,948 across 160 assets.", scrapedAt: "2026-06-17T00:00:00Z" },
];
function scrapeReport(over: Partial<import("../types.js").Metric> = {}) {
  const base: import("../types.js").Report = {
    question: "q", asOf: "2026-06-18",
    claims: [{ id: "s1", text: "Mantle RWA total is $241,080,948", forwardLooking: false,
      metrics: [{ label: "Mantle RWA total", value: 241_080_948,
        provenance: { kind: "scrape", domain: "defillama.com", url: "https://defillama.com/chain/Mantle",
          scrapedAt: "2026-06-17T00:00:00Z", scope: "mantle-specific", figure: "$241,080,948" }, ...over }] }],
  };
  return base;
}

describe("checkProvenance — scrape (corroborated) tier", () => {
  it("passes when figure is in fresh scrape, domain corroborates, value matches", () => {
    const r = checkProvenance(scrapeReport(), [], [], "2026-06-18", scrapes, sourceAllowlist);
    expect(r.passed).toBe(true);
  });
  it("rejects when the figure string is absent from the scraped text", () => {
    const report = scrapeReport();
    report.claims[0].metrics[0].value = 999_999;
    (report.claims[0].metrics[0].provenance as any).figure = "$999,999";
    const r = checkProvenance(report, [], [], "2026-06-18", scrapes, sourceAllowlist);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => /not found in scraped page text/.test(f.reason))).toBe(true);
  });
  it("rejects when the domain lacks the corroboration role", () => {
    const report = scrapeReport();
    (report.claims[0].metrics[0].provenance as any).domain = "app.rwa.xyz";
    (report.claims[0].metrics[0].provenance as any).url = "https://app.rwa.xyz/networks";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/provenance-checker.test.ts`
Expected: FAIL — `checkProvenance` ignores extra args / scrape branch missing.

- [ ] **Step 3: Implement the scrape branch**

In `src/verify/provenance-checker.ts`:

Add imports at top:

```ts
import type { ScrapeResult, SourceAllowlistEntry } from "../types.js";
import { parseFigure } from "./figures.js";
import { hasRole } from "./source-allowlist.js";
```

Add this function above `checkMetric`:

```ts
function checkScrapeMetric(
  claimId: string,
  m: Metric,
  scrapes: ScrapeResult[],
  sourceAllowlist: SourceAllowlistEntry[],
  asOf: string,
): CheckFailure[] {
  const fails: CheckFailure[] = [];
  const p = m.provenance as Extract<Metric["provenance"], { kind: "scrape" }>;

  if (!hasRole(p.domain, "corroboration", sourceAllowlist)) {
    fails.push({ claimId, metricLabel: m.label, reason: `domain ${p.domain} not allowed to corroborate numbers` });
  }
  const scrape = scrapes.find((s) => s.url === p.url);
  if (!scrape) {
    fails.push({ claimId, metricLabel: m.label, reason: `no fresh scrape captured for ${p.url}` });
    return fails;
  }
  if (!scrape.text.toLowerCase().includes(p.figure.toLowerCase())) {
    fails.push({ claimId, metricLabel: m.label, reason: `figure "${p.figure}" not found in scraped page text` });
  }
  const parsed = parseFigure(p.figure);
  if (parsed === null || Math.abs(parsed - m.value) >= 1) {
    fails.push({ claimId, metricLabel: m.label, reason: `figure "${p.figure}" does not equal claimed value ${m.value}` });
  }
  if (daysBetween(asOf, scrape.scrapedAt) >= FRESHNESS_WINDOW_DAYS) {
    fails.push({ claimId, metricLabel: m.label, reason: `stale scrape: ${scrape.scrapedAt} exceeds freshness window` });
  }
  return fails;
}
```

Change `checkMetric`'s signature and add the scrape branch. Replace the `checkMetric` declaration line and its dune `if`:

```ts
function checkMetric(
  claimId: string,
  m: Metric,
  dune: DuneResultRef[],
  allowlist: AllowlistEntry[],
  asOf: string,
  scrapes: ScrapeResult[],
  sourceAllowlist: SourceAllowlistEntry[],
): CheckFailure[] {
```

Inside `checkMetric`, after the `if (!m.provenance) { ... return fails; }` block, change `if (m.provenance.kind === "dune") {` to keep the dune block, and add an `else if` after it:

```ts
  } else if (m.provenance.kind === "scrape") {
    fails.push(...checkScrapeMetric(claimId, m, scrapes, sourceAllowlist, asOf));
  }
```

Update `checkProvenance` signature and the `checkMetric` call:

```ts
export function checkProvenance(
  report: Report,
  dune: DuneResultRef[],
  allowlist: AllowlistEntry[],
  now: string,
  scrapes: ScrapeResult[] = [],
  sourceAllowlist: SourceAllowlistEntry[] = [],
): CheckResult {
```

and the inner loop call:

```ts
      failures.push(...checkMetric(claim.id, m, dune, allowlist, report.asOf, scrapes, sourceAllowlist));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/verify/provenance-checker.test.ts && npx tsc --noEmit`
Expected: PASS (existing dune cases + 5 new scrape cases); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/verify/provenance-checker.ts src/verify/provenance-checker.test.ts
git commit -m "feat(verify): corroborated scrape tier (domain role + strict string-match + freshness)"
```

---

### Task 5: Accuracy rule (global vs Mantle)

**Files:**
- Modify: `src/verify/provenance-checker.ts` (extend `checkScrapeMetric`)
- Test: `src/verify/provenance-checker.test.ts` (append)

**Interfaces:**
- Consumes: scrape metric `scope` field (Task 1).
- Produces: a global-scope scrape figure is rejected unless its `label` contains "global" (case-insensitive).

- [ ] **Step 1: Write the failing tests**

Append to `src/verify/provenance-checker.test.ts`:

```ts
describe("checkProvenance — global-vs-Mantle accuracy rule", () => {
  const globalScrapes: ScrapeResult[] = [
    { url: "https://defillama.com/x", domain: "defillama.com",
      text: "USDY global AUM is $2.15B.", scrapedAt: "2026-06-17T00:00:00Z" },
  ];
  function globalReport(label: string): import("../types.js").Report {
    return { question: "q", asOf: "2026-06-18",
      claims: [{ id: "g1", text: "USDY AUM is $2.15B", forwardLooking: false,
        metrics: [{ label, value: 2_150_000_000,
          provenance: { kind: "scrape", domain: "defillama.com", url: "https://defillama.com/x",
            scrapedAt: "2026-06-17T00:00:00Z", scope: "global", figure: "$2.15B" } }] }] };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/provenance-checker.test.ts`
Expected: FAIL — global-without-label currently passes.

- [ ] **Step 3: Implement the rule**

In `checkScrapeMetric` (`src/verify/provenance-checker.ts`), before `return fails;`, add:

```ts
  if (p.scope === "global" && !/global/i.test(m.label)) {
    fails.push({ claimId, metricLabel: m.label, reason: `global figure must be labeled "global" (got "${m.label}")` });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/verify/provenance-checker.test.ts`
Expected: PASS (all scrape + accuracy cases).

- [ ] **Step 5: Commit**

```bash
git add src/verify/provenance-checker.ts src/verify/provenance-checker.test.ts
git commit -m "feat(verify): enforce global-vs-Mantle labeling on corroborated figures"
```

---

### Task 6: Tier derivation

**Files:**
- Create: `src/verify/tier.ts`
- Test: `src/verify/tier.test.ts`

**Interfaces:**
- Consumes: `Claim`, `ClaimTier` (Task 1).
- Produces: `deriveTier(claim: Claim): ClaimTier` — `forward-looking` if no numeric metrics; `verified` if every numeric metric is dune-kind; otherwise `corroborated`. (Called after the gate passes, so all metrics are already valid.)

- [ ] **Step 1: Write the failing test**

Create `src/verify/tier.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveTier } from "./tier.js";
import type { Claim } from "../types.js";

const dune = (): Claim => ({ id: "a", text: "t", forwardLooking: false,
  metrics: [{ label: "x", value: 1, provenance: { kind: "dune", queryId: 1, column: "c", row: 0 } }] });
const scrape = (): Claim => ({ id: "b", text: "t", forwardLooking: false,
  metrics: [{ label: "x", value: 1, provenance: { kind: "scrape", domain: "d", url: "u", scrapedAt: "2026-06-17", scope: "mantle-specific", figure: "1" } }] });

describe("deriveTier", () => {
  it("verified when all numeric metrics are dune", () => {
    expect(deriveTier(dune())).toBe("verified");
  });
  it("corroborated when any numeric metric is a scrape", () => {
    const c = dune();
    c.metrics.push(scrape().metrics[0]);
    expect(deriveTier(c)).toBe("corroborated");
  });
  it("forward-looking when there are no numeric metrics", () => {
    expect(deriveTier({ id: "c", text: "may grow", forwardLooking: true, metrics: [] })).toBe("forward-looking");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/tier.test.ts`
Expected: FAIL — cannot find module `./tier.js`.

- [ ] **Step 3: Write the implementation**

Create `src/verify/tier.ts`:

```ts
import type { Claim, ClaimTier } from "../types.js";

/**
 * Deterministic tier for a claim that has already passed the gate.
 * - forward-looking: no numeric metrics.
 * - verified: every numeric metric is a recomputable Dune cell.
 * - corroborated: relies on at least one allowlisted scrape figure.
 */
export function deriveTier(claim: Claim): ClaimTier {
  if (claim.metrics.length === 0) return "forward-looking";
  const allDune = claim.metrics.every((m) => m.provenance?.kind === "dune");
  return allDune ? "verified" : "corroborated";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/verify/tier.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verify/tier.ts src/verify/tier.test.ts
git commit -m "feat(verify): deterministic claim tier derivation"
```

---

### Task 7: Thread scrapes + source allowlist through the gate

**Files:**
- Modify: `src/verify/gate.ts`
- Test: `src/verify/gate.test.ts` (append one case)

**Interfaces:**
- Consumes: extended `checkProvenance` (Task 4/5), `ScrapeResult`/`SourceAllowlistEntry` (Task 1).
- Produces: `runGate(report, dune, allowlist, now, judgeFn, scrapes?: ScrapeResult[], sourceAllowlist?: SourceAllowlistEntry[]): Promise<GateResult>` — forwards the new args; defaults `[]` keep existing callers working.

- [ ] **Step 1: Write the failing test**

Append to `src/verify/gate.test.ts` (add imports `ScrapeResult, SourceAllowlistEntry` from `../types.js`):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/gate.test.ts`
Expected: FAIL — extra args ignored; deterministic stage rejects the scrape claim (`no fresh scrape` / domain).

- [ ] **Step 3: Implement the forwarding**

In `src/verify/gate.ts`, add imports:

```ts
import type { Report, DuneResultRef, AllowlistEntry, CheckFailure, ScrapeResult, SourceAllowlistEntry } from "../types.js";
```

Update `runGate`:

```ts
export async function runGate(
  report: Report,
  dune: DuneResultRef[],
  allowlist: AllowlistEntry[],
  now: string,
  judgeFn: (r: Report) => Promise<JudgeVerdict>,
  scrapes: ScrapeResult[] = [],
  sourceAllowlist: SourceAllowlistEntry[] = [],
): Promise<GateResult> {
  const det = checkProvenance(report, dune, allowlist, now, scrapes, sourceAllowlist);
  if (!det.passed) return { passed: false, stage: "deterministic", failures: det.failures };

  const verdict = await judgeFn(report);
  if (!verdict.passed) {
    return { passed: false, stage: "qualitative", failures: [], judgeNotes: verdict.notes };
  }
  return { passed: true, stage: "passed", failures: [], judgeNotes: verdict.notes };
}
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass (original 45 + new source-allowlist/figures/scrape/accuracy/tier/gate cases); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/verify/gate.ts src/verify/gate.test.ts
git commit -m "feat(verify): thread scrapes + source allowlist through runGate"
```

---

## Self-Review

**Spec coverage (§4 of spec):**
- Three-kind `ProvenanceRef` → Task 1. ✓
- `checkScrapeMetric` (domain role, strict string-match, value equality, freshness) → Tasks 2–4. ✓
- Accuracy rule (global must be labeled) → Task 5. ✓
- `Claim.tier` derivation → Task 6. ✓
- Backward-compatible gate threading → Task 7. ✓
- 45-day TTL reused (`FRESHNESS_WINDOW_DAYS`) — not redefined. ✓
- Data-model deltas (AllowlistEntry category/status, Claim category/tier, SourceAllowlistEntry, ScrapeResult) → Task 1. ✓
- `data/source-allowlist.json` with rwa.xyz discovery-only → Task 2. ✓

**Deferred to later plans (intentional, not gaps):** discovery/registry-scout + match-onchain (Plan 2); operator wiring of discovery + scrape capture + tier attachment to claims + deck engine (Plans 2–3). Task 6 ships `deriveTier` as a pure unit; its call site in the operator lands in Plan 2/3.

**Placeholder scan:** none — every code/test step has literal content.

**Type consistency:** `checkProvenance` and `runGate` use identical param order `(…, scrapes, sourceAllowlist)`; `hasRole(domain, role, list)`, `parseFigure(s)`, `deriveTier(claim)` signatures match across tasks; scrape `ProvenanceRef` fields (`domain,url,scrapedAt,scope,figure`) are consistent in Tasks 1, 4, 5, 7.
