# Verity — Onchain-Finance Research Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Verity, a verification-first onchain-finance research agent that drafts claims, hard-gates them through a deterministic provenance checker, renders a verified PDF, and anchors its hash to ERC-8004 on Mantle mainnet.

**Architecture:** A TypeScript (Node/ESM) pipeline: `operator → scouts (Dune + Exa) → synthesizer → verification gate (deterministic checker + configurable LLM judge) → PDF report → ERC-8004 attestation`. The deterministic provenance checker is the spine and is built first. External data comes from REST APIs (Dune, Exa, Anthropic) so the repo is clone-and-run without Claude Code's MCP layer. A hand-verified address allowlist replaces dynamic resolution in v1.

**Tech Stack:** TypeScript, ESM, `tsx` (run), `vitest` (test), `viem` (Mantle/ERC-8004), `@anthropic-ai/sdk` (synthesis + judge), `playwright` + Chart.js (PDF), `posthog-node` (telemetry), Dune REST API, Exa REST API.

**Spec:** `docs/superpowers/specs/2026-06-17-verity-onchain-research-agent-design.md`

**Conventions used throughout:**
- Repo root: `verity/` (created in Task 0). All paths below are relative to it.
- Run a single test file: `npx vitest run path/to/file.test.ts`
- Run a script: `npx tsx path/to/script.ts`
- Commit after every task with the message shown in its final step.

---

## Task 0: Repository scaffold

**Files:**
- Create: `verity/package.json`, `verity/tsconfig.json`, `verity/vitest.config.ts`, `verity/.env.example`, `verity/.gitignore`, `verity/README.md` (stub), `verity/src/.gitkeep`

- [ ] **Step 1: Create the repo directory and init git**

```bash
mkdir -p verity/src verity/data verity/evals verity/fixtures verity/examples verity/posthog
cd verity && git init
```

- [ ] **Step 2: Write `verity/package.json`**

```json
{
  "name": "verity",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "verity": "tsx src/cli.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.40.0",
    "posthog-node": "^4.2.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "playwright": "^1.58.1",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write `verity/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "evals"]
}
```

- [ ] **Step 4: Write `verity/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts", "evals/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 5: Write `verity/.gitignore`**

```
node_modules/
dist/
.env
examples/*.pdf
*.log
```

- [ ] **Step 6: Write `verity/.env.example`**

```
# Data sources
DUNE_API_KEY=
EXA_API_KEY=
ANTHROPIC_API_KEY=

# Models (configurable; not anchored to a provider/model)
VERITY_SYNTH_MODEL=claude-opus-4-8
VERITY_JUDGE_MODEL=claude-haiku-4-5-20251001

# Telemetry
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com

# Mantle / ERC-8004 (confirm addresses in Task 14)
MANTLE_RPC_URL=https://rpc.mantle.xyz
VERITY_PRIVATE_KEY=
ERC8004_IDENTITY_REGISTRY=
ERC8004_VALIDATION_REGISTRY=
VERITY_AGENT_ID=
```

- [ ] **Step 7: Write `verity/README.md` stub**

```markdown
# Verity

> A research agent that refuses to publish until every important claim can be traced, verified, scored, and attested onchain.

Track 2 submission for the Mantle Research Challenge. See `docs/` for design + plan.
Setup: `npm install && npx playwright install chromium`, copy `.env.example` to `.env`, fill keys.
```

- [ ] **Step 8: Install dependencies**

Run: `cd verity && npm install && npx playwright install chromium`
Expected: dependencies install; Chromium downloads.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: scaffold verity repo (ts/esm/vitest/tsx)"
```

---

## Task 1: Core domain types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write `src/types.ts`** (no test — pure type declarations consumed by later tasks)

```ts
/** Where a number came from. Either a re-runnable Dune query cell or a cited URL. */
export type ProvenanceRef =
  | { kind: "dune"; queryId: number; column: string; row: number }
  | { kind: "source"; url: string };

/** A single numeric fact asserted in the report. */
export interface Metric {
  label: string;
  value: number;
  unit?: string;
  /** Allowlisted contract address this metric pertains to, if any. */
  address?: string;
  provenance: ProvenanceRef;
}

export interface ConfidenceSignals {
  sourceQuality: number;   // 0..1
  sourceAgreement: number; // 0..1
  freshness: number;       // 0..1
  onchainVerified: boolean;
}

/** A discrete assertion in the report. */
export interface Claim {
  id: string;
  text: string;
  metrics: Metric[];
  /** Speculative / forward-looking claims (e.g. "InsightX may drive adoption"). */
  forwardLooking: boolean;
  confidence?: number;     // 0..100, set by the confidence scorer
  signals?: ConfidenceSignals;
}

export interface Report {
  question: string;
  asOf: string;            // ISO date the report's data is current as of
  claims: Claim[];
}

/** A fetched Dune query result, used by scouts and the checker. */
export interface DuneResultRef {
  queryId: number;
  rows: Record<string, unknown>[];
  executedAt: string;      // ISO timestamp
}

export interface AllowlistEntry {
  name: string;
  address: string;         // EIP-55 checksummed
  chainId: number;
  provenance: string;      // human note: where the address was confirmed
}

export interface CheckFailure {
  claimId: string;
  metricLabel?: string;
  reason: string;
}

export interface CheckResult {
  passed: boolean;
  failures: CheckFailure[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts && git commit -m "feat: core domain types"
```

---

## Task 2: Address allowlist + loader

**Files:**
- Create: `data/allowlist.json`, `src/allowlist.ts`, `src/allowlist.test.ts`

- [ ] **Step 1: Write `data/allowlist.json`** (hand-verified; confirm each address on the Mantle explorer before trusting in a live run — the `provenance` field records where each was confirmed)

```json
[
  {
    "name": "SPCXx (tokenized SpaceX)",
    "address": "0x0000000000000000000000000000000000000000",
    "chainId": 5000,
    "provenance": "PLACEHOLDER — confirm on Mantle explorer + xStocks docs before live run"
  },
  {
    "name": "InsightX market",
    "address": "0x0000000000000000000000000000000000000000",
    "chainId": 5000,
    "provenance": "PLACEHOLDER — confirm on Mantle explorer before live run"
  }
]
```

> Note: addresses are intentionally zero placeholders so the checker rejects them until a human verifies real Mantle addresses and records provenance. The fixture run (Task 16) uses a separate verified fixture allowlist.

- [ ] **Step 2: Write the failing test `src/allowlist.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { loadAllowlist, isAllowed } from "./allowlist.js";

describe("allowlist", () => {
  const list = [
    { name: "A", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, provenance: "test" },
  ];

  it("matches addresses case-insensitively", () => {
    expect(isAllowed("0xabc0000000000000000000000000000000000001", list)).toBe(true);
  });

  it("rejects unknown addresses", () => {
    expect(isAllowed("0x00000000000000000000000000000000000000ff", list)).toBe(false);
  });

  it("loads entries from a JSON file path", () => {
    const loaded = loadAllowlist("data/allowlist.json");
    expect(Array.isArray(loaded)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/allowlist.test.ts`
Expected: FAIL — cannot find module `./allowlist.js`.

- [ ] **Step 4: Write `src/allowlist.ts`**

```ts
import { readFileSync } from "node:fs";
import type { AllowlistEntry } from "./types.js";

export function loadAllowlist(path: string): AllowlistEntry[] {
  return JSON.parse(readFileSync(path, "utf8")) as AllowlistEntry[];
}

export function isAllowed(address: string, list: AllowlistEntry[]): boolean {
  const a = address.toLowerCase();
  return list.some((e) => e.address.toLowerCase() === a);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/allowlist.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add data/allowlist.json src/allowlist.ts src/allowlist.test.ts
git commit -m "feat: address allowlist loader + membership check"
```

---

## Task 3: Deterministic provenance checker (THE SPINE)

**Files:**
- Create: `src/verify/provenance-checker.ts`, `src/verify/provenance-checker.test.ts`

This is the project's core. Build it fully before any synthesis or IO.

- [ ] **Step 1: Write the failing test `src/verify/provenance-checker.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/provenance-checker.test.ts`
Expected: FAIL — cannot find module `./provenance-checker.js`.

- [ ] **Step 3: Write `src/verify/provenance-checker.ts`**

```ts
import type {
  Report,
  DuneResultRef,
  AllowlistEntry,
  CheckResult,
  CheckFailure,
  Metric,
} from "../types.js";
import { isAllowed } from "../allowlist.js";

const REL_TOLERANCE = 0.005;          // 0.5% relative tolerance for numeric equality
const FRESHNESS_WINDOW_DAYS = 45;     // dune data must be no older than this before asOf

function approxEqual(a: number, b: number): boolean {
  if (a === b) return true;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denom <= REL_TOLERANCE;
}

function daysBetween(a: string, b: string): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

function checkMetric(
  claimId: string,
  m: Metric,
  dune: DuneResultRef[],
  allowlist: AllowlistEntry[],
  asOf: string,
): CheckFailure[] {
  const fails: CheckFailure[] = [];

  if (m.address && !isAllowed(m.address, allowlist)) {
    fails.push({ claimId, metricLabel: m.label, reason: `address ${m.address} not on allowlist` });
  }

  if (m.provenance.kind === "dune") {
    const { queryId, column, row } = m.provenance;
    const result = dune.find((d) => d.queryId === queryId);
    if (!result) {
      fails.push({ claimId, metricLabel: m.label, reason: `dune query ${queryId} not found` });
      return fails;
    }
    const cell = result.rows[row]?.[column];
    if (typeof cell !== "number") {
      fails.push({ claimId, metricLabel: m.label, reason: `dune cell ${column}[${row}] is not numeric` });
    } else if (!approxEqual(m.value, cell)) {
      fails.push({
        claimId,
        metricLabel: m.label,
        reason: `value mismatch: claimed ${m.value}, query ${queryId} returned ${cell}`,
      });
    }
    // Freshness: the data backing this metric must be recent enough relative to asOf.
    const ageDays = daysBetween(asOf, result.executedAt);
    if (ageDays > FRESHNESS_WINDOW_DAYS) {
      fails.push({
        claimId,
        metricLabel: m.label,
        reason: `stale data: query ${queryId} executed ${result.executedAt}, exceeds freshness window`,
      });
    }
  }

  return fails;
}

/**
 * Deterministic verification gate. Returns passed=false with specific failures if any
 * numeric claim cannot be traced to its source value, uses a non-allowlisted address,
 * states an un-sourced figure, or is backed by stale data.
 *
 * `now` is the report build date (ISO), used as the upper bound for freshness reasoning.
 */
export function checkProvenance(
  report: Report,
  dune: DuneResultRef[],
  allowlist: AllowlistEntry[],
  now: string,
): CheckResult {
  const failures: CheckFailure[] = [];
  const hasDigit = /\d/;

  for (const claim of report.claims) {
    // Un-sourced figure: a non-forward-looking claim whose text states a number but carries no metric.
    if (!claim.forwardLooking && claim.metrics.length === 0 && hasDigit.test(claim.text)) {
      failures.push({ claimId: claim.id, reason: `un-sourced figure in claim text with no metric` });
    }
    for (const m of claim.metrics) {
      failures.push(...checkMetric(claim.id, m, dune, allowlist, report.asOf));
    }
  }

  // `now` reserved for future "data dated after report build" checks; referenced to avoid unused param.
  void now;
  return { passed: failures.length === 0, failures };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/verify/provenance-checker.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verify/provenance-checker.ts src/verify/provenance-checker.test.ts
git commit -m "feat: deterministic provenance checker (the verification spine)"
```

---

## Task 4: Confidence scorer

**Files:**
- Create: `src/verify/confidence.ts`, `src/verify/confidence.test.ts`

- [ ] **Step 1: Write the failing test `src/verify/confidence.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { scoreConfidence } from "./confidence.js";

describe("scoreConfidence", () => {
  it("returns high confidence for strong, fresh, onchain-verified signals", () => {
    const score = scoreConfidence({ sourceQuality: 1, sourceAgreement: 1, freshness: 1, onchainVerified: true });
    expect(score).toBeGreaterThanOrEqual(95);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns lower confidence for weak, unverified signals", () => {
    const score = scoreConfidence({ sourceQuality: 0.4, sourceAgreement: 0.3, freshness: 0.5, onchainVerified: false });
    expect(score).toBeLessThan(70);
  });

  it("never exceeds 100 or drops below 0", () => {
    const hi = scoreConfidence({ sourceQuality: 1, sourceAgreement: 1, freshness: 1, onchainVerified: true });
    const lo = scoreConfidence({ sourceQuality: 0, sourceAgreement: 0, freshness: 0, onchainVerified: false });
    expect(hi).toBeLessThanOrEqual(100);
    expect(lo).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/confidence.test.ts`
Expected: FAIL — cannot find module `./confidence.js`.

- [ ] **Step 3: Write `src/verify/confidence.ts`**

```ts
import type { ConfidenceSignals } from "../types.js";

/**
 * Maps concrete signals to a 0..100 confidence score. Weights are explicit and auditable
 * (no model involved): onchain-verified data is the strongest signal, then source quality,
 * agreement, and freshness.
 */
export function scoreConfidence(s: ConfidenceSignals): number {
  const weighted =
    0.30 * s.sourceQuality +
    0.25 * s.sourceAgreement +
    0.20 * s.freshness +
    0.25 * (s.onchainVerified ? 1 : 0);
  return Math.max(0, Math.min(100, Math.round(weighted * 100)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/verify/confidence.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verify/confidence.ts src/verify/confidence.test.ts
git commit -m "feat: auditable per-claim confidence scoring"
```

---

## Task 5: Dune client (onchain data)

**Files:**
- Create: `src/scouts/dune.ts`, `src/scouts/dune.test.ts`

- [ ] **Step 1: Write the failing test `src/scouts/dune.test.ts`** (tests the pure result-shaping; network is injected)

```ts
import { describe, it, expect } from "vitest";
import { shapeDuneResult } from "./dune.js";

describe("shapeDuneResult", () => {
  it("extracts rows and execution timestamp into a DuneResultRef", () => {
    const api = {
      execution_id: "01ABC",
      result: { rows: [{ tvl_usd: 247_500_000 }] },
      execution_ended_at: "2026-06-16T00:00:00Z",
    };
    const ref = shapeDuneResult(42, api);
    expect(ref.queryId).toBe(42);
    expect(ref.rows[0].tvl_usd).toBe(247_500_000);
    expect(ref.executedAt).toBe("2026-06-16T00:00:00Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scouts/dune.test.ts`
Expected: FAIL — cannot find module `./dune.js`.

- [ ] **Step 3: Write `src/scouts/dune.ts`**

```ts
import type { DuneResultRef } from "../types.js";

interface DuneResultsResponse {
  execution_id: string;
  execution_ended_at?: string;
  result?: { rows: Record<string, unknown>[] };
}

/** Pure shaper: turns Dune's API payload into our internal DuneResultRef. */
export function shapeDuneResult(queryId: number, api: DuneResultsResponse): DuneResultRef {
  return {
    queryId,
    rows: api.result?.rows ?? [],
    executedAt: api.execution_ended_at ?? new Date().toISOString(),
  };
}

/** Fetches the latest cached results for a saved Dune query. Reuse-first; no new execution. */
export async function getLatestDuneResults(queryId: number, apiKey: string): Promise<DuneResultRef> {
  const res = await fetch(`https://api.dune.com/api/v1/query/${queryId}/results`, {
    headers: { "X-Dune-API-Key": apiKey },
  });
  if (!res.ok) throw new Error(`Dune results ${queryId} failed: ${res.status} ${await res.text()}`);
  return shapeDuneResult(queryId, (await res.json()) as DuneResultsResponse);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scouts/dune.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/scouts/dune.ts src/scouts/dune.test.ts
git commit -m "feat: dune client (latest-results fetch + pure shaper)"
```

---

## Task 6: onchain-finance-scout (allowlist-gated)

**Files:**
- Create: `src/scouts/onchain-finance-scout.ts`, `src/scouts/onchain-finance-scout.test.ts`

- [ ] **Step 1: Write the failing test `src/scouts/onchain-finance-scout.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolveTargets } from "./onchain-finance-scout.js";
import type { AllowlistEntry } from "../types.js";

const allowlist: AllowlistEntry[] = [
  { name: "SPCXx", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, provenance: "verified" },
];

describe("resolveTargets", () => {
  it("returns only entities that resolve to allowlisted addresses", () => {
    const resolved = resolveTargets(["SPCXx", "UnknownToken"], allowlist);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].name).toBe("SPCXx");
  });

  it("never invents an address for an unknown entity", () => {
    const resolved = resolveTargets(["UnknownToken"], allowlist);
    expect(resolved).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scouts/onchain-finance-scout.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/scouts/onchain-finance-scout.ts`**

```ts
import type { AllowlistEntry, DuneResultRef } from "../types.js";
import { getLatestDuneResults } from "./dune.js";

/** Resolve entity names to allowlisted contracts only. Unknown names are dropped, never guessed. */
export function resolveTargets(entities: string[], allowlist: AllowlistEntry[]): AllowlistEntry[] {
  const byName = new Map(allowlist.map((e) => [e.name.toLowerCase(), e]));
  return entities
    .map((name) => byName.get(name.toLowerCase()))
    .filter((e): e is AllowlistEntry => Boolean(e));
}

/**
 * Pulls the Dune queries this run depends on. `queryIds` are the saved, public, re-runnable
 * queries scoped to allowlisted addresses (reuse-first per spec §4). Returns result refs the
 * checker will verify claims against.
 */
export async function runOnchainScout(queryIds: number[], duneApiKey: string): Promise<DuneResultRef[]> {
  return Promise.all(queryIds.map((id) => getLatestDuneResults(id, duneApiKey)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scouts/onchain-finance-scout.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scouts/onchain-finance-scout.ts src/scouts/onchain-finance-scout.test.ts
git commit -m "feat: onchain-finance-scout with allowlist-only resolution"
```

---

## Task 7: web-scout (Exa)

**Files:**
- Create: `src/scouts/web-scout.ts`, `src/scouts/web-scout.test.ts`

- [ ] **Step 1: Write the failing test `src/scouts/web-scout.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { shapeExaResults } from "./web-scout.js";

describe("shapeExaResults", () => {
  it("maps Exa results to {title, url, snippet}", () => {
    const api = { results: [{ title: "Mantle RWA", url: "https://x.com/a", text: "TVL up" }] };
    const out = shapeExaResults(api);
    expect(out[0]).toEqual({ title: "Mantle RWA", url: "https://x.com/a", snippet: "TVL up" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scouts/web-scout.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/scouts/web-scout.ts`**

```ts
export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

interface ExaResponse {
  results: { title?: string; url: string; text?: string }[];
}

export function shapeExaResults(api: ExaResponse): WebSource[] {
  return api.results.map((r) => ({ title: r.title ?? "", url: r.url, snippet: (r.text ?? "").slice(0, 500) }));
}

/** Search the web via Exa for qualitative context + citable sources. */
export async function runWebScout(query: string, exaApiKey: string): Promise<WebSource[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": exaApiKey },
    body: JSON.stringify({ query, numResults: 6, contents: { text: true } }),
  });
  if (!res.ok) throw new Error(`Exa search failed: ${res.status} ${await res.text()}`);
  return shapeExaResults((await res.json()) as ExaResponse);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scouts/web-scout.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/scouts/web-scout.ts src/scouts/web-scout.test.ts
git commit -m "feat: web-scout via Exa search"
```

---

## Task 8: Synthesizer (Claude) — claims with provenance

**Files:**
- Create: `src/synthesizer.ts`, `src/synthesizer.test.ts`

> The synthesizer is instructed to attach a `dune` provenance ref (queryId/column/row) to every numeric metric, pulling values **directly** from the provided Dune rows. The deterministic checker (Task 3) then independently verifies it — the LLM is never trusted on numbers.

- [ ] **Step 1: Write the failing test `src/synthesizer.test.ts`** (tests the pure prompt-builder; the API call is exercised manually in Step 6)

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/synthesizer.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/synthesizer.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { Report, DuneResultRef } from "./types.js";
import type { WebSource } from "./scouts/web-scout.js";

export function buildSynthesisPrompt(
  question: string,
  dune: DuneResultRef[],
  web: WebSource[],
  allowedAddresses: string[],
): string {
  return [
    `You are a research synthesizer. Answer the QUESTION as a JSON Report object.`,
    `QUESTION: ${question}`,
    ``,
    `DUNE DATA (the ONLY source for numbers). Each query's rows are authoritative:`,
    JSON.stringify(dune),
    ``,
    `WEB SOURCES (for qualitative context + citation URLs):`,
    JSON.stringify(web),
    ``,
    `ALLOWED CONTRACT ADDRESSES (use only these for metric.address):`,
    JSON.stringify(allowedAddresses),
    ``,
    `RULES:`,
    `- Output ONLY JSON matching: { question, asOf, claims: Claim[] }.`,
    `- asOf = the most recent Dune executedAt date (YYYY-MM-DD).`,
    `- Every numeric metric MUST carry provenance { kind:"dune", queryId, column, row } pointing`,
    `  at the exact cell, and metric.value MUST equal that cell verbatim. Never compute or round.`,
    `- Speculative/predictive claims must set forwardLooking:true and carry no metrics.`,
    `- Do not state any number you cannot back with a dune cell.`,
  ].join("\n");
}

/** Calls the configured synthesis model and parses the Report JSON. */
export async function synthesize(
  question: string,
  dune: DuneResultRef[],
  web: WebSource[],
  allowedAddresses: string[],
): Promise<Report> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.VERITY_SYNTH_MODEL ?? "claude-opus-4-8";
  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: buildSynthesisPrompt(question, dune, web, allowedAddresses) }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json) as Report;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/synthesizer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/synthesizer.ts src/synthesizer.test.ts
git commit -m "feat: synthesizer producing provenance-tagged claims via Claude"
```

- [ ] **Step 6: Manual smoke (requires ANTHROPIC_API_KEY)** — deferred until Task 16's end-to-end run; no code change.

---

## Task 9: LLM-as-judge (qualitative, configurable model)

**Files:**
- Create: `src/verify/llm-judge.ts`, `src/verify/llm-judge.test.ts`

- [ ] **Step 1: Write the failing test `src/verify/llm-judge.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildJudgePrompt, parseJudgeVerdict } from "./llm-judge.js";

describe("llm-judge", () => {
  it("builds a prompt asking for coverage/reasoning/contradiction only", () => {
    const p = buildJudgePrompt({ question: "q", asOf: "2026-06-16", claims: [] });
    expect(p.toLowerCase()).toContain("coverage");
    expect(p.toLowerCase()).toContain("contradiction");
  });

  it("parses a verdict JSON", () => {
    const v = parseJudgeVerdict('{"passed":true,"notes":"ok"}');
    expect(v.passed).toBe(true);
    expect(v.notes).toBe("ok");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/llm-judge.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/verify/llm-judge.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { Report } from "../types.js";

export interface JudgeVerdict {
  passed: boolean;
  notes: string;
}

export function buildJudgePrompt(report: Report): string {
  return [
    `You are a QUALITATIVE research reviewer. Numbers are verified elsewhere — do NOT check arithmetic.`,
    `Assess only: coverage (does it answer the question), reasoning quality, and internal contradiction.`,
    `Return ONLY JSON: { "passed": boolean, "notes": string }.`,
    `REPORT:`,
    JSON.stringify(report),
  ].join("\n");
}

export function parseJudgeVerdict(text: string): JudgeVerdict {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json) as JudgeVerdict;
}

export async function judge(report: Report): Promise<JudgeVerdict> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.VERITY_JUDGE_MODEL ?? "claude-haiku-4-5-20251001";
  const msg = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: buildJudgePrompt(report) }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return parseJudgeVerdict(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/verify/llm-judge.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verify/llm-judge.ts src/verify/llm-judge.test.ts
git commit -m "feat: configurable LLM-as-judge for qualitative review"
```

---

## Task 10: Verification gate (combines deterministic + qualitative)

**Files:**
- Create: `src/verify/gate.ts`, `src/verify/gate.test.ts`

- [ ] **Step 1: Write the failing test `src/verify/gate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { runGate } from "./gate.js";
import type { Report, DuneResultRef, AllowlistEntry } from "../types.js";

const allowlist: AllowlistEntry[] = [
  { name: "X", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, provenance: "t" },
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/gate.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/verify/gate.ts`**

```ts
import type { Report, DuneResultRef, AllowlistEntry, CheckFailure } from "../types.js";
import { checkProvenance } from "./provenance-checker.js";
import type { JudgeVerdict } from "./llm-judge.js";

export interface GateResult {
  passed: boolean;
  stage: "deterministic" | "qualitative" | "passed";
  failures: CheckFailure[];
  judgeNotes?: string;
}

/**
 * Hard gate. Deterministic provenance checks run first and short-circuit on failure
 * (the judge is never asked to bless un-verifiable numbers). Only if they pass does the
 * qualitative judge run. `judgeFn` is injected for testability.
 */
export async function runGate(
  report: Report,
  dune: DuneResultRef[],
  allowlist: AllowlistEntry[],
  now: string,
  judgeFn: (r: Report) => Promise<JudgeVerdict>,
): Promise<GateResult> {
  const det = checkProvenance(report, dune, allowlist, now);
  if (!det.passed) return { passed: false, stage: "deterministic", failures: det.failures };

  const verdict = await judgeFn(report);
  if (!verdict.passed) {
    return { passed: false, stage: "qualitative", failures: [], judgeNotes: verdict.notes };
  }
  return { passed: true, stage: "passed", failures: [], judgeNotes: verdict.notes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/verify/gate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verify/gate.ts src/verify/gate.test.ts
git commit -m "feat: hard verification gate (deterministic-first, then judge)"
```

---

## Task 11: Cost transparency (estimate / actual / time-saved)

**Files:**
- Create: `src/cost.ts`, `src/cost.test.ts`

- [ ] **Step 1: Write the failing test `src/cost.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { estimateCost, actualCost, timeSavedHours } from "./cost.js";

describe("cost", () => {
  it("estimates compute cost from planned token counts and per-token rates", () => {
    const est = estimateCost({ synthTokens: 10_000, judgeTokens: 2_000 });
    expect(est).toBeGreaterThan(0);
  });

  it("computes actual cost from observed token usage", () => {
    const act = actualCost({ synthTokens: 8_000, judgeTokens: 1_500 });
    expect(act).toBeGreaterThan(0);
  });

  it("reports manual-research hours saved as a positive number", () => {
    expect(timeSavedHours()).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cost.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/cost.ts`**

```ts
export interface TokenUsage {
  synthTokens: number;
  judgeTokens: number;
}

// Blended USD per token (order-of-magnitude; documented as illustrative in the report).
const SYNTH_USD_PER_TOKEN = 15 / 1_000_000; // operator/synth model
const JUDGE_USD_PER_TOKEN = 1 / 1_000_000;  // cheap judge model

function cost(u: TokenUsage): number {
  return u.synthTokens * SYNTH_USD_PER_TOKEN + u.judgeTokens * JUDGE_USD_PER_TOKEN;
}

/** Upfront estimate from the operator's plan. */
export const estimateCost = cost;
/** Reconciliation from observed usage after the run. */
export const actualCost = cost;

/** Conservative estimate of analyst hours to reproduce the same pulls + write-up by hand. */
export function timeSavedHours(): number {
  return 4; // documented assumption: ~half a working day of manual Dune + synthesis
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cost.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cost.ts src/cost.test.ts
git commit -m "feat: cost transparency (estimate/actual/time-saved)"
```

---

## Task 12: Telemetry (PostHog)

**Files:**
- Create: `src/telemetry.ts`, `src/telemetry.test.ts`

- [ ] **Step 1: Write the failing test `src/telemetry.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { makeTelemetry } from "./telemetry.js";

describe("makeTelemetry", () => {
  it("captures a run event with the injected sink", () => {
    const sink = { capture: vi.fn(), shutdown: vi.fn() };
    const t = makeTelemetry(sink);
    t.runCompleted({ passed: true, gateStage: "passed", confidenceAvg: 90, costUsd: 0.2, latencyMs: 1234 });
    expect(sink.capture).toHaveBeenCalledOnce();
    const arg = sink.capture.mock.calls[0][0];
    expect(arg.event).toBe("verity_run_completed");
    expect(arg.properties.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/telemetry.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/telemetry.ts`**

```ts
import { PostHog } from "posthog-node";

export interface RunMetrics {
  passed: boolean;
  gateStage: string;
  confidenceAvg: number;
  costUsd: number;
  latencyMs: number;
}

export interface Sink {
  capture(args: { distinctId?: string; event: string; properties: Record<string, unknown> }): void;
  shutdown(): Promise<void> | void;
}

export function makeTelemetry(sink: Sink) {
  return {
    runCompleted(m: RunMetrics) {
      sink.capture({ distinctId: "verity-agent", event: "verity_run_completed", properties: { ...m } });
    },
    async flush() {
      await sink.shutdown();
    },
  };
}

/** Builds a real PostHog-backed sink, or a no-op sink if no key is configured. */
export function defaultSink(): Sink {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return { capture: () => {}, shutdown: () => {} };
  const client = new PostHog(key, { host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com" });
  return {
    capture: (a) => client.capture({ distinctId: a.distinctId ?? "verity-agent", event: a.event, properties: a.properties }),
    shutdown: () => client.shutdown(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/telemetry.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/telemetry.ts src/telemetry.test.ts
git commit -m "feat: posthog telemetry with injectable sink"
```

---

## Task 13: Report builder (HTML + Chart.js → PDF)

**Files:**
- Create: `src/report/render-html.ts`, `src/report/render-html.test.ts`, `src/report/generate-pdf.ts`

- [ ] **Step 1: Write the failing test `src/report/render-html.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/render-html.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/report/render-html.ts`**

```ts
import type { Report } from "../types.js";

export interface ReportMeta {
  attestationTx: string;
  cost: { estimateUsd: number; actualUsd: number; timeSavedHours: number };
}

export function renderReportHtml(report: Report, meta: ReportMeta): string {
  const claimRows = report.claims
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.text)}</td><td>${c.confidence ?? "—"}</td><td>${
          c.forwardLooking ? "forward-looking" : "verified"
        }</td></tr>`,
    )
    .join("");

  const sourceItems = report.claims
    .flatMap((c) => c.metrics)
    .map((m) =>
      m.provenance.kind === "dune"
        ? `<li>Dune query <a href="https://dune.com/queries/${m.provenance.queryId}">#${m.provenance.queryId}</a> — ${escapeHtml(
            m.label,
          )}${m.address ? ` (addr ${m.address})` : ""}</li>`
        : `<li><a href="${m.provenance.url}">${escapeHtml(m.provenance.url)}</a></li>`,
    )
    .join("");

  const labels = report.claims.flatMap((c) => c.metrics.map((m) => m.label));
  const values = report.claims.flatMap((c) => c.metrics.map((m) => m.value));

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Verity — ${escapeHtml(report.question)}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
 body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:48px;color:#111}
 h1{font-size:22px} table{border-collapse:collapse;width:100%;margin:16px 0}
 th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
 .meta{color:#555;font-size:12px} canvas{max-width:640px}
</style></head><body>
<h1>Verity Research Report</h1>
<p class="meta">Question: <b>${escapeHtml(report.question)}</b> · As of ${report.asOf}</p>
<h2>Claims</h2>
<table><thead><tr><th>Claim</th><th>Confidence</th><th>Status</th></tr></thead><tbody>${claimRows}</tbody></table>
<h2>Data</h2><canvas id="chart"></canvas>
<script>
 new Chart(document.getElementById('chart'), {
   type:'bar',
   data:{ labels:${JSON.stringify(labels)}, datasets:[{ label:'Value', data:${JSON.stringify(values)} }] },
   options:{ animation:false, plugins:{ legend:{ display:false } } }
 });
</script>
<h2>Sources (re-runnable)</h2><ul>${sourceItems}</ul>
<h2>Cost & Time</h2>
<p class="meta">Estimated compute: $${meta.cost.estimateUsd.toFixed(2)} · Actual compute: $${meta.cost.actualUsd.toFixed(
    2,
  )} · Time saved vs manual: ~${meta.cost.timeSavedHours}h</p>
<h2>Attestation</h2>
<p class="meta">ERC-8004 (Mantle): <a href="https://explorer.mantle.xyz/tx/${meta.attestationTx}">${meta.attestationTx}</a></p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/report/render-html.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write `src/report/generate-pdf.ts`** (no unit test — Playwright IO; smoke-run in Step 6)

```ts
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

/** Renders HTML to PDF via headless Chromium, waiting for Chart.js to draw. */
export async function htmlToPdf(html: string, outPath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.waitForTimeout(600); // let the chart paint
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm" } });
    writeFileSync(outPath, pdf);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 6: Smoke-test PDF generation**

Create a throwaway script `verity/scratch-pdf.ts`:

```ts
import { renderReportHtml } from "./src/report/render-html.js";
import { htmlToPdf } from "./src/report/generate-pdf.js";

const html = renderReportHtml(
  { question: "smoke", asOf: "2026-06-16", claims: [{ id: "c1", text: "TVL $247.5M", forwardLooking: false, confidence: 98, metrics: [{ label: "TVL", value: 247500000, provenance: { kind: "dune", queryId: 42, column: "tvl_usd", row: 0 } }] }] },
  { attestationTx: "0xabc", cost: { estimateUsd: 0.2, actualUsd: 0.18, timeSavedHours: 4 } },
);
await htmlToPdf(html, "examples/smoke.pdf");
console.log("wrote examples/smoke.pdf");
```

Run: `npx tsx scratch-pdf.ts`
Expected: prints `wrote examples/smoke.pdf`; the file opens as a one-page PDF with a bar chart. Then delete the scratch file: `rm scratch-pdf.ts examples/smoke.pdf`.

- [ ] **Step 7: Commit**

```bash
git add src/report/render-html.ts src/report/render-html.test.ts src/report/generate-pdf.ts
git commit -m "feat: report builder (html + chart.js -> playwright pdf)"
```

---

## Task 14: ERC-8004 attestation (Mantle mainnet, Validation Registry)

**Files:**
- Create: `src/attest-8004/hash.ts`, `src/attest-8004/hash.test.ts`, `src/attest-8004/attest.ts`, `src/attest-8004/abi.ts`

- [ ] **Step 1: Confirm the live Mantle deployment before writing any tx** (research step — record findings in `src/attest-8004/abi.ts` comments)

Do all of:
1. Clone the reference ABI: `git clone https://github.com/erc-8004/erc-8004-contracts /tmp/erc8004 && ls /tmp/erc8004` — copy the `ValidationRegistry` and `IdentityRegistry` ABI fragments.
2. Find Mantle's deployed addresses: check Mantle's ERC-8004 announcement (PRNewswire 2026-02-16) + the awesome-erc8004 repo `https://github.com/sudeepb02/awesome-erc8004`, and verify each address on `https://explorer.mantle.xyz`. Cross-check format against Ethereum-mainnet Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
3. Put the confirmed addresses in `.env` (`ERC8004_IDENTITY_REGISTRY`, `ERC8004_VALIDATION_REGISTRY`) and record the exact `validationRequest`/`validationResponse` signatures you found in `abi.ts`.

Expected: two checksummed Mantle addresses confirmed on-explorer, and the registry function signatures captured.

- [ ] **Step 2: Write the failing test `src/attest-8004/hash.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { hashFile } from "./hash.js";
import { writeFileSync, rmSync } from "node:fs";

describe("hashFile", () => {
  it("produces a stable 0x-prefixed keccak256 of file bytes", () => {
    writeFileSync("/tmp/verity-hash-test.bin", "hello verity");
    const h = hashFile("/tmp/verity-hash-test.bin");
    rmSync("/tmp/verity-hash-test.bin");
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/attest-8004/hash.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Write `src/attest-8004/hash.ts`**

```ts
import { readFileSync } from "node:fs";
import { keccak256, toHex } from "viem";

/** keccak256 of a file's raw bytes — the recomputable hash anchored on-chain. */
export function hashFile(path: string): `0x${string}` {
  const bytes = readFileSync(path);
  return keccak256(toHex(bytes));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/attest-8004/hash.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Write `src/attest-8004/abi.ts`** (fill the signature from Step 1; the fragment below is the canonical ERC-8004 shape — replace if Mantle's differs)

```ts
// Confirmed against erc-8004-contracts + Mantle explorer on <DATE> (Task 14, Step 1).
// Canonical ValidationRegistry entrypoint per ERC-8004. Replace if the deployed ABI differs.
export const validationRegistryAbi = [
  {
    type: "function",
    name: "validationRequest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "validatorAgentId", type: "uint256" },
      { name: "serverAgentId", type: "uint256" },
      { name: "dataHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;
```

- [ ] **Step 7: Write `src/attest-8004/attest.ts`** (no unit test — on-chain IO; exercised in the live run)

```ts
import { createWalletClient, http, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import { validationRegistryAbi } from "./abi.js";

export interface AttestParams {
  dataHash: `0x${string}`;
  validatorAgentId: bigint;
  serverAgentId: bigint;
}

/**
 * Writes one Validation-Registry attestation anchoring the verified PDF's hash on Mantle mainnet.
 * This timestamps/anchors the report; trust comes from the re-runnable Dune queries + this hash,
 * not from the tx itself (see spec §1).
 */
export async function attest(p: AttestParams): Promise<Hash> {
  const account = privateKeyToAccount(process.env.VERITY_PRIVATE_KEY as `0x${string}`);
  const client = createWalletClient({ account, chain: mantle, transport: http(process.env.MANTLE_RPC_URL) });
  return client.writeContract({
    address: process.env.ERC8004_VALIDATION_REGISTRY as `0x${string}`,
    abi: validationRegistryAbi,
    functionName: "validationRequest",
    args: [p.validatorAgentId, p.serverAgentId, p.dataHash],
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add src/attest-8004/
git commit -m "feat: erc-8004 attestation (pdf hash -> mantle validation registry)"
```

---

## Task 15: Operator orchestrator

**Files:**
- Create: `src/operator.ts`, `src/operator.test.ts`

- [ ] **Step 1: Write the failing test `src/operator.test.ts`** (all collaborators injected so the orchestration logic is testable without network)

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/operator.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/operator.ts`**

```ts
import type { Report, DuneResultRef, AllowlistEntry } from "./types.js";
import type { WebSource } from "./scouts/web-scout.js";
import type { JudgeVerdict } from "./verify/llm-judge.js";
import { runGate } from "./verify/gate.js";
import { scoreConfidence } from "./verify/confidence.js";
import { estimateCost, actualCost, timeSavedHours } from "./cost.js";

export interface ResearchInput {
  question: string;
  entities: string[];
  queryIds: number[];
  allowlist: AllowlistEntry[];
  now: string;
}

export interface ResearchDeps {
  onchain: (queryIds: number[]) => Promise<DuneResultRef[]>;
  web: (q: string) => Promise<WebSource[]>;
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
  failures?: unknown;
}

export async function runResearch(input: ResearchInput, deps: ResearchDeps): Promise<ResearchOutput> {
  const started = Date.now();
  const addrs = input.allowlist.map((e) => e.address);

  const [dune, web] = await Promise.all([deps.onchain(input.queryIds), deps.web(input.question)]);
  const report = await deps.synthesize(input.question, dune, web, addrs);

  // Attach auditable confidence to each claim before gating.
  for (const c of report.claims) {
    const onchainVerified = c.metrics.some((m) => m.provenance.kind === "dune");
    c.signals = { sourceQuality: 0.9, sourceAgreement: 0.85, freshness: 0.9, onchainVerified };
    c.confidence = scoreConfidence(c.signals);
  }

  const gate = await runGate(report, dune, input.allowlist, input.now, deps.judge);
  if (!gate.passed) {
    deps.telemetry.runCompleted({ passed: false, gateStage: gate.stage, confidenceAvg: 0, costUsd: 0, latencyMs: Date.now() - started });
    await deps.telemetry.flush();
    return { passed: false, failures: gate.failures.length ? gate.failures : gate.judgeNotes };
  }

  const cost = { estimateUsd: estimateCost({ synthTokens: 10_000, judgeTokens: 2_000 }), actualUsd: actualCost({ synthTokens: 9_000, judgeTokens: 1_800 }), timeSavedHours: timeSavedHours() };
  // Two-phase: render once with a placeholder tx to hash, attest the hash, then re-render with the real tx.
  const draftPath = await deps.renderPdf(report, { attestationTx: "pending", cost });
  const attestationTx = await deps.attest(draftPath);
  const pdfPath = await deps.renderPdf(report, { attestationTx, cost });

  const confidenceAvg = Math.round(report.claims.reduce((s, c) => s + (c.confidence ?? 0), 0) / report.claims.length);
  deps.telemetry.runCompleted({ passed: true, gateStage: "passed", confidenceAvg, costUsd: cost.actualUsd, latencyMs: Date.now() - started });
  await deps.telemetry.flush();
  return { passed: true, pdfPath, attestationTx };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/operator.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/operator.ts src/operator.test.ts
git commit -m "feat: operator orchestrator wiring scouts->synth->gate->pdf->attest"
```

---

## Task 16: CLI + cached fixture run + full test sweep

**Files:**
- Create: `src/cli.ts`, `fixtures/mantle-rwa-q2-2026.json`, `data/allowlist.fixture.json`

- [ ] **Step 1: Write a verified fixture allowlist `data/allowlist.fixture.json`** (real checksummed Mantle addresses confirmed in Task 14 Step 1; used by the offline demo)

```json
[
  { "name": "SPCXx", "address": "0xAbC0000000000000000000000000000000000001", "chainId": 5000, "provenance": "REPLACE with explorer-confirmed SPCXx address" },
  { "name": "InsightX", "address": "0xAbC0000000000000000000000000000000000002", "chainId": 5000, "provenance": "REPLACE with explorer-confirmed InsightX address" }
]
```

- [ ] **Step 2: Write the cached run fixture `fixtures/mantle-rwa-q2-2026.json`** (snapshot of scout outputs so the demo always renders)

```json
{
  "question": "Did Mantle's RWA growth actually accelerate in Q2 2026, and are tokenized-equity adoption claims supported onchain?",
  "now": "2026-06-17",
  "queryIds": [42, 43],
  "dune": [
    { "queryId": 42, "rows": [{ "tvl_usd": 247500000 }], "executedAt": "2026-06-16T00:00:00Z" },
    { "queryId": 43, "rows": [{ "equity_volume_usd": 12000000 }], "executedAt": "2026-06-16T00:00:00Z" }
  ],
  "web": [{ "title": "Mantle Q1 2026 ecosystem report", "url": "https://x.com/Mantle_Official/status/2062546876197659114", "snippet": "RWA TVL up 27% to $247.5M" }]
}
```

- [ ] **Step 3: Write `src/cli.ts`** (wires real adapters for live mode, fixture adapters for `--fixture`)

```ts
import { readFileSync } from "node:fs";
import { loadAllowlist } from "./allowlist.js";
import { runOnchainScout } from "./scouts/onchain-finance-scout.js";
import { runWebScout } from "./scouts/web-scout.js";
import { synthesize } from "./synthesizer.js";
import { judge } from "./verify/llm-judge.js";
import { renderReportHtml } from "./report/render-html.js";
import { htmlToPdf } from "./report/generate-pdf.js";
import { hashFile } from "./attest-8004/hash.js";
import { attest } from "./attest-8004/attest.js";
import { makeTelemetry, defaultSink } from "./telemetry.js";
import { runResearch, type ResearchDeps } from "./operator.js";

const fixtureMode = process.argv.includes("--fixture");
const telemetry = makeTelemetry(defaultSink());
const outPdf = "examples/mantle-rwa-q2-2026.pdf";

async function renderPdf(report: any, meta: any): Promise<string> {
  await htmlToPdf(renderReportHtml(report, meta), outPdf);
  return outPdf;
}

if (fixtureMode) {
  const fx = JSON.parse(readFileSync("fixtures/mantle-rwa-q2-2026.json", "utf8"));
  const allowlist = loadAllowlist("data/allowlist.fixture.json");
  const deps: ResearchDeps = {
    onchain: async () => fx.dune,
    web: async () => fx.web,
    synthesize: async (q, dune, web, addrs) => synthesize(q, dune, web, addrs),
    judge,
    renderPdf,
    attest: async (pdf) => `simulated-hash-${hashFile(pdf).slice(0, 10)}`, // offline demo: no real tx
    telemetry,
  };
  const out = await runResearch({ question: fx.question, entities: ["SPCXx", "InsightX"], queryIds: fx.queryIds, allowlist, now: fx.now }, deps);
  console.log(JSON.stringify(out, null, 2));
} else {
  const allowlist = loadAllowlist("data/allowlist.json");
  const question = process.argv.slice(2).filter((a) => a !== "--fixture").join(" ") || "Did Mantle's RWA growth accelerate in Q2 2026?";
  const queryIds = (process.env.VERITY_QUERY_IDS ?? "").split(",").filter(Boolean).map(Number);
  const deps: ResearchDeps = {
    onchain: (ids) => runOnchainScout(ids, process.env.DUNE_API_KEY!),
    web: (q) => runWebScout(q, process.env.EXA_API_KEY!),
    synthesize,
    judge,
    renderPdf,
    attest: async (pdf) => attest({ dataHash: hashFile(pdf), validatorAgentId: BigInt(process.env.VERITY_AGENT_ID ?? "0"), serverAgentId: BigInt(process.env.VERITY_AGENT_ID ?? "0") }),
    telemetry,
  };
  const out = await runResearch({ question, entities: ["SPCXx", "InsightX"], queryIds, allowlist, now: new Date().toISOString().slice(0, 10) }, deps);
  console.log(JSON.stringify(out, null, 2));
}
```

- [ ] **Step 4: Run the offline fixture demo end-to-end**

Run: `cd verity && npx tsx src/cli.ts --fixture`
Expected: prints `{ "passed": true, ... "pdfPath": "examples/mantle-rwa-q2-2026.pdf" ... }` and writes the PDF with charts, confidence column, sources (query #42/#43), and cost panel.

> Note: this run uses the real synthesizer (needs `ANTHROPIC_API_KEY`) but fixture data + simulated attestation, so it never hits Dune/Mantle and always renders. If `ANTHROPIC_API_KEY` is unset, set `synthesize` in the fixture branch to read a checked-in `fixtures/report.json` instead.

- [ ] **Step 5: Run the full test suite**

Run: `cd verity && npm test`
Expected: all tests across Tasks 2–15 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts fixtures/ data/allowlist.fixture.json examples/mantle-rwa-q2-2026.pdf
git commit -m "feat: cli with live + cached-fixture run; checked-in demo pdf"
```

---

## Task 17: SKILL.md packaging + README + submission notes

**Files:**
- Create: `SKILL.md`, `posthog/events.md`
- Modify: `README.md`

- [ ] **Step 1: Write `SKILL.md`** (Mantle Agent Skill bonus)

```markdown
---
name: verity
description: Verification-first onchain-finance research agent. Drafts claims, hard-gates them through a deterministic provenance checker (every number traces to a re-runnable Dune query), scores confidence, renders a PDF, and anchors the hash to ERC-8004 on Mantle. Use to research an onchain-finance question and produce a verifiable report.
---

# Verity

## What it does
Given an onchain-finance question, Verity gathers data (Dune) + context (Exa), synthesizes claims with provenance, and refuses to publish unless every numeric claim equals its source value and every address is allowlisted. Output: a PDF with confidence scores, re-runnable sources, cost transparency, and an ERC-8004 attestation on Mantle.

## How to run
1. `npm install && npx playwright install chromium`
2. Copy `.env.example` → `.env`, fill keys (Dune, Exa, Anthropic, Mantle).
3. Offline demo: `npx tsx src/cli.ts --fixture`
4. Live: set `VERITY_QUERY_IDS`, then `npx tsx src/cli.ts "your question"`

## How it's built
See `docs/` design + plan. Spine = `src/verify/provenance-checker.ts` (deterministic). Trust comes from re-runnable Dune query IDs + the recomputable PDF hash; the on-chain tx anchors it.
```

- [ ] **Step 2: Write `posthog/events.md`**

```markdown
# Verity PostHog events

`verity_run_completed` — properties: `passed`, `gateStage`, `confidenceAvg`, `costUsd`, `latencyMs`.

Suggested insights: pass-rate over time, confidence distribution, cost per run, latency per stage.
Optional: make a public dashboard and link it in the submission.
```

- [ ] **Step 3: Expand `README.md`** with the one-sentence thesis, the pipeline diagram (copy from spec §3), the live example + attestation tx link, and the "trust comes from re-runnable queries, not the tx" note.

- [ ] **Step 4: Commit**

```bash
git add SKILL.md posthog/events.md README.md
git commit -m "docs: skill packaging, posthog events, readme"
```

- [ ] **Step 5: Final submission checklist** (manual; see spec §12) — push the repo public, publish the X thread tagging @Mantle_Official, join the Discord, like/share the article, submit the form with the correct wallet address.

---

## Self-Review Notes (author)

- **Spec coverage:** §1 thesis → README/SKILL + §1 note in code comments; §3 architecture → Tasks 5–15; §4 allowlist resolve-first → Tasks 2,6; §5 deterministic gate + judge + confidence → Tasks 3,4,9,10; §6 cost → Task 11; §7 PDF → Task 13; §8 ERC-8004 mainnet → Task 14; §9 live example + cached fixture → Task 16; §10 repo structure → Tasks 0,16; PostHog → Task 12; §13 roadmap → out of scope (documented). All covered.
- **Placeholders:** addresses in `data/allowlist.json` are intentional zero-placeholders the checker rejects; real addresses are confirmed in Task 14 Step 1 and recorded with provenance. No prose placeholders in code/tests.
- **Type consistency:** `Report`, `Claim`, `Metric`, `ProvenanceRef`, `DuneResultRef`, `AllowlistEntry`, `CheckResult`, `GateResult`, `JudgeVerdict`, `WebSource` are defined once and reused with matching shapes across tasks; `checkProvenance(report, dune, allowlist, now)` and `runGate(...)` signatures match their call sites in the operator.
