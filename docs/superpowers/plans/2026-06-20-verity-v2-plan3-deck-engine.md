# Verity v2 — Plan 3: Landscape Deck Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Verity's single-page HTML report with a Delphi-grade **landscape deck** — cover, TOC, per-category section dividers, content slides with tier badges + auto charts + source captions, and a re-runnable sources appendix — rendered programmatically (no external assets) so the offline `--fixture` PDF stays key-free and hash-recomputable.

**Architecture:** Content model → slide model → HTML → landscape PDF, pure except the Playwright step. New pure modules: `theme.ts` (design tokens + CSS + tier-badge colors), `charts.ts` (`selectChart` picks line/bar/doughnut from metric shape), `slides.ts` (`buildDeck` groups claims by RWA category, lays out pages, emits a `Slide[]`), `render-deck.ts` (`renderDeck` → HTML, vendoring Chart.js inline like the old renderer). `generate-pdf.ts` gains landscape sizing. The old `render-html.ts` + its test are deleted and the CLI switches to `renderDeck`. `tier`/`category` already populated on claims (Plan 2 operator) feed the deck.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), `tsx` to run, `vitest` to test, Playwright/Chromium for PDF, Chart.js UMD vendored from `node_modules`.

## Global Constraints

- Cardinal Rule unchanged: the deck renders only gated claims; every slide traces to a claim. No decorative figures implying unbacked analysis. Source captions cite re-runnable Dune IDs or dated scrapes.
- Programmatic visuals only — CSS gradients/theme + Chart.js canvases; **no external image/font URLs** (offline render + recomputable hash). Chart.js is read from `node_modules` and inlined, never CDN-loaded.
- TDD: failing test → run fail → minimal impl → run pass → commit. One behavior per test.
- ESM only; import sibling modules with explicit `.js` suffix.
- All pure functions stay network-free; only `generate-pdf.ts` touches Playwright.
- Backward compatibility: existing **70/70** tests stay green except the deliberately-removed `render-html.test.ts` (Task 6); the `--fixture` render must remain green and key-free after Task 6.
- Tier badge colors: Verified = green, Corroborated = amber, Forward-looking = grey.

---

### Task 1: Slide + chart data-model types

**Files:**
- Modify: `src/types.ts`
- Test: none new (verified by `tsc` + downstream task tests)

**Interfaces:**
- Consumes: existing `RwaCategory`, `ClaimTier`.
- Produces (in `src/types.ts`):
  - `RWA_CATEGORIES: RwaCategory[]` — canonical display order.
  - `interface ChartSpec { type: "line" | "bar" | "doughnut"; labels: string[]; values: number[] }`
  - `Slide` union:
    - `{ kind: "cover"; title: string; asOf: string }`
    - `{ kind: "toc"; sections: { numeral: string; category: RwaCategory; pageRange: string }[] }`
    - `{ kind: "divider"; numeral: string; category: RwaCategory }`
    - `{ kind: "content"; headline: string; body: string; tier: ClaimTier; sourceCaption: string; chart?: ChartSpec; callout?: string }`
    - `{ kind: "appendix"; sources: { label: string; detail: string }[] }`

- [ ] **Step 1: Add the types**

In `src/types.ts`, append at the end of the file:

```ts
/** Canonical display order for RWA categories (deck sections, grouping). */
export const RWA_CATEGORIES: RwaCategory[] = [
  "tokenized-treasuries",
  "tokenized-equities",
  "index-fund",
  "private-credit",
  "commodities",
  "real-estate",
  "other",
];

/** A chart panel derived from a claim's metrics. */
export interface ChartSpec {
  type: "line" | "bar" | "doughnut";
  labels: string[];
  values: number[];
}

/** One rendered page of the report deck. */
export type Slide =
  | { kind: "cover"; title: string; asOf: string }
  | { kind: "toc"; sections: { numeral: string; category: RwaCategory; pageRange: string }[] }
  | { kind: "divider"; numeral: string; category: RwaCategory }
  | { kind: "content"; headline: string; body: string; tier: ClaimTier; sourceCaption: string; chart?: ChartSpec; callout?: string }
  | { kind: "appendix"; sources: { label: string; detail: string }[] };
```

- [ ] **Step 2: Verify type-check + suite still pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; **70 passed** (additive types break nothing).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add Slide union, ChartSpec, RWA_CATEGORIES order"
```

---

### Task 2: Theme tokens + CSS

**Files:**
- Create: `src/report/theme.ts`
- Test: `src/report/theme.test.ts`

**Interfaces:**
- Consumes: `ClaimTier` (existing).
- Produces:
  - `TIER_COLORS: Record<ClaimTier, string>` — `verified` green, `corroborated` amber, `forward-looking` grey.
  - `TIER_LABELS: Record<ClaimTier, string>` — human badge text (`Verified` / `Corroborated` / `Forward-looking`).
  - `themeCss(): string` — base stylesheet: serif display headings + sans body, gradient cover, tier-badge classes, slide/footer layout, and a landscape `@page` rule.

- [ ] **Step 1: Write the failing test**

Create `src/report/theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TIER_COLORS, TIER_LABELS, themeCss } from "./theme.js";

describe("theme", () => {
  it("defines a color + label for every tier", () => {
    for (const t of ["verified", "corroborated", "forward-looking"] as const) {
      expect(TIER_COLORS[t]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(TIER_LABELS[t].length).toBeGreaterThan(0);
    }
  });
  it("emits landscape @page sizing and uses the tier colors", () => {
    const css = themeCss();
    expect(css).toMatch(/@page[^}]*landscape/);
    expect(css).toContain(TIER_COLORS.verified);
    expect(css).toContain(TIER_COLORS.corroborated);
    expect(css).toContain(TIER_COLORS["forward-looking"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/theme.test.ts`
Expected: FAIL — cannot find module `./theme.js`.

- [ ] **Step 3: Write the implementation**

Create `src/report/theme.ts`:

```ts
import type { ClaimTier } from "../types.js";

/** Tier badge colors: Verified=green, Corroborated=amber, Forward-looking=grey. */
export const TIER_COLORS: Record<ClaimTier, string> = {
  verified: "#1a7f4b",
  corroborated: "#b8860b",
  "forward-looking": "#6b7280",
};

export const TIER_LABELS: Record<ClaimTier, string> = {
  verified: "Verified",
  corroborated: "Corroborated",
  "forward-looking": "Forward-looking",
};

/** Base stylesheet for the landscape deck. Programmatic only — no external fonts/images. */
export function themeCss(): string {
  return `
 @page { size: A4 landscape; margin: 0; }
 * { box-sizing: border-box; }
 body { margin: 0; color: #14181f; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
 .slide { position: relative; width: 297mm; height: 209mm; padding: 22mm 26mm 18mm; overflow: hidden; page-break-after: always; }
 .slide:last-child { page-break-after: auto; }
 h1, h2, .display { font-family: Georgia, "Times New Roman", serif; font-weight: 700; letter-spacing: -0.01em; }
 .cover { background: linear-gradient(135deg, #0b1f3a 0%, #123a63 55%, #1f6f8b 100%); color: #f5f8fc; display: flex; flex-direction: column; justify-content: center; }
 .cover .kicker { text-transform: uppercase; letter-spacing: 0.18em; font-size: 12px; opacity: 0.8; }
 .cover h1 { font-size: 40px; line-height: 1.1; margin: 14px 0; max-width: 80%; }
 .cover .asof { font-size: 14px; opacity: 0.85; }
 .divider { background: linear-gradient(135deg, #11253f 0%, #1f6f8b 100%); color: #f5f8fc; display: flex; flex-direction: column; justify-content: center; }
 .divider .numeral { font-size: 56px; opacity: 0.6; }
 .divider h2 { font-size: 34px; margin: 6px 0 0; }
 .content h1 { font-size: 26px; line-height: 1.2; margin: 0 0 10px; max-width: 70%; }
 .content .body { font-size: 15px; line-height: 1.55; max-width: 60%; color: #2a313c; }
 .panel { position: absolute; right: 26mm; top: 30mm; width: 105mm; }
 .panel canvas { max-width: 105mm; }
 .callout { margin-top: 18px; font-family: Georgia, serif; font-size: 20px; color: #123a63; }
 .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; color: #fff; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
 .badge.verified { background: ${TIER_COLORS.verified}; }
 .badge.corroborated { background: ${TIER_COLORS.corroborated}; }
 .badge.forward-looking { background: ${TIER_COLORS["forward-looking"]}; }
 .caption { margin-top: 8px; font-size: 12px; color: #5b6personally; }
 .toc h2 { font-size: 28px; margin: 0 0 18px; }
 .toc ol { font-size: 16px; line-height: 2; list-style: none; padding: 0; }
 .toc .pages { color: #5b6470; }
 .appendix h2 { font-size: 26px; margin: 0 0 14px; }
 .appendix ul { font-size: 12px; line-height: 1.8; }
 .footer { position: absolute; left: 26mm; right: 26mm; bottom: 10mm; display: flex; justify-content: space-between; font-size: 11px; color: #8b94a0; border-top: 1px solid #e3e7ec; padding-top: 6px; }
`;
}
```

> Note: fix the obvious typo before saving — `#5b6personally` is not a color. Use `color: #5b6470;` for `.caption`. (Listed here so the implementer corrects it; the literal value to write is `#5b6470`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/report/theme.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/report/theme.ts src/report/theme.test.ts
git commit -m "feat(report): deck theme tokens + landscape CSS + tier badges"
```

---

### Task 3: Chart type selection

**Files:**
- Create: `src/report/charts.ts`
- Test: `src/report/charts.test.ts`

**Interfaces:**
- Consumes: `Metric`, `ChartSpec` (existing/Task 1).
- Produces: `selectChart(metrics: Metric[]): ChartSpec | null` — `null` if fewer than 2 numeric metrics; `"line"` if every label is temporal (matches `Q[1-4]`, a 4-digit year, or a month name); `"doughnut"` if every metric is a share (`unit === "%"`, or label contains `%`/`share`); otherwise `"bar"`. Labels/values are taken in metric order.

- [ ] **Step 1: Write the failing test**

Create `src/report/charts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectChart } from "./charts.js";
import type { Metric } from "../types.js";

const m = (label: string, value: number, unit?: string): Metric =>
  ({ label, value, unit, provenance: { kind: "dune", queryId: 1, column: "c", row: 0 } });

describe("selectChart", () => {
  it("returns null for fewer than two metrics", () => {
    expect(selectChart([m("RWA TVL", 1)])).toBeNull();
    expect(selectChart([])).toBeNull();
  });
  it("picks line for temporal labels", () => {
    const c = selectChart([m("Q1 2026 TVL", 195_000_000), m("Q2 2026 TVL", 247_500_000)]);
    expect(c).toEqual({ type: "line", labels: ["Q1 2026 TVL", "Q2 2026 TVL"], values: [195_000_000, 247_500_000] });
  });
  it("picks doughnut when every metric is a share", () => {
    const c = selectChart([m("Treasuries share", 60, "%"), m("Equities share", 40, "%")]);
    expect(c?.type).toBe("doughnut");
  });
  it("picks bar otherwise", () => {
    const c = selectChart([m("USDY supply", 25_900_000), m("mUSD supply", 57_700)]);
    expect(c?.type).toBe("bar");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/charts.test.ts`
Expected: FAIL — cannot find module `./charts.js`.

- [ ] **Step 3: Write the implementation**

Create `src/report/charts.ts`:

```ts
import type { Metric, ChartSpec } from "../types.js";

const TEMPORAL = /\bq[1-4]\b|\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

function isTemporal(label: string): boolean {
  return TEMPORAL.test(label);
}
function isShare(m: Metric): boolean {
  return m.unit === "%" || /%|share/i.test(m.label);
}

/**
 * Pick a chart type from the shape of a claim's metrics. Deterministic:
 * temporal labels → line; all-share metrics → doughnut; otherwise comparative bar.
 * Returns null when there are not enough points to chart (< 2 metrics).
 */
export function selectChart(metrics: Metric[]): ChartSpec | null {
  if (metrics.length < 2) return null;
  const labels = metrics.map((m) => m.label);
  const values = metrics.map((m) => m.value);
  let type: ChartSpec["type"] = "bar";
  if (labels.every(isTemporal)) type = "line";
  else if (metrics.every(isShare)) type = "doughnut";
  return { type, labels, values };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/report/charts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/report/charts.ts src/report/charts.test.ts
git commit -m "feat(report): chart-type selection from metric shape"
```

---

### Task 4: Deck builder (content → slide model)

**Files:**
- Create: `src/report/slides.ts`
- Test: `src/report/slides.test.ts`

**Interfaces:**
- Consumes: `Report`, `Claim`, `Slide`, `RwaCategory`, `RWA_CATEGORIES` (Task 1), `selectChart` (Task 3), `ReportMeta` (re-exported from `render-deck.ts` in Task 5 — to avoid a forward dependency, `buildDeck` takes the meta inline).
- Produces:
  - `interface DeckMeta { attestationTx: string; cost: { estimateUsd: number; actualUsd: number; timeSavedHours: number } }`
  - `buildDeck(report: Report, meta: DeckMeta): Slide[]` — pure. Order: `cover`, `toc`, then per present category in `RWA_CATEGORIES` order a `divider` + one `content` slide per claim, then `appendix`. Claims with no `category` group under `"other"`. Page ranges in the TOC count cover=1, toc=2, then sections, then appendix.

- [ ] **Step 1: Write the failing test**

Create `src/report/slides.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/slides.test.ts`
Expected: FAIL — cannot find module `./slides.js`.

- [ ] **Step 3: Write the implementation**

Create `src/report/slides.ts`:

```ts
import type { Report, Claim, Slide, RwaCategory } from "../types.js";
import { RWA_CATEGORIES } from "../types.js";
import { selectChart } from "./charts.js";

export interface DeckMeta {
  attestationTx: string;
  cost: { estimateUsd: number; actualUsd: number; timeSavedHours: number };
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

function headlineOf(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return firstSentence.trim();
}

function captionOf(c: Claim): string {
  const p = c.metrics[0]?.provenance;
  if (!p) return "Forward-looking — no on-chain figure";
  if (p.kind === "dune") return `Dune #${p.queryId}`;
  if (p.kind === "scrape") return `${p.domain}, scraped ${p.scrapedAt.slice(0, 10)}`;
  return p.url;
}

function calloutOf(c: Claim): string | undefined {
  const m = c.metrics[0];
  if (!m) return undefined;
  const v = Math.abs(m.value) >= 1e6 ? `$${(m.value / 1e6).toFixed(1)}M` : m.value.toLocaleString();
  return `${m.label}: ${v}`;
}

function sourcesOf(report: Report): { label: string; detail: string }[] {
  const out: { label: string; detail: string }[] = [];
  const seen = new Set<string>();
  for (const c of report.claims) {
    for (const m of c.metrics) {
      const p = m.provenance;
      let label = "Source";
      let detail = "";
      if (p.kind === "dune") { label = `Dune #${p.queryId}`; detail = `https://dune.com/queries/${p.queryId}`; }
      else if (p.kind === "scrape") { label = p.domain; detail = `${p.url} (scraped ${p.scrapedAt.slice(0, 10)})`; }
      else { detail = p.url; }
      if (seen.has(detail)) continue;
      seen.add(detail);
      out.push({ label, detail });
    }
  }
  return out;
}

/** Build the ordered slide model. Pure. Groups claims by RWA category in canonical order. */
export function buildDeck(report: Report, _meta: DeckMeta): Slide[] {
  const byCat = new Map<RwaCategory, Claim[]>();
  for (const c of report.claims) {
    const cat = c.category ?? "other";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(c);
  }
  const cats = RWA_CATEGORIES.filter((c) => byCat.has(c));

  // Page layout: 1=cover, 2=toc, then each section (divider + N content), then appendix.
  let page = 3;
  const sections = cats.map((cat, i) => {
    const claims = byCat.get(cat)!;
    const start = page;
    const end = page + claims.length; // divider page + claims.length content pages
    page = end + 1;
    return { numeral: ROMAN[i] ?? `${i + 1}`, category: cat, pageRange: `${start}–${end}`, claims };
  });

  const slides: Slide[] = [];
  slides.push({ kind: "cover", title: report.question, asOf: report.asOf });
  slides.push({ kind: "toc", sections: sections.map((s) => ({ numeral: s.numeral, category: s.category, pageRange: s.pageRange })) });
  for (const s of sections) {
    slides.push({ kind: "divider", numeral: s.numeral, category: s.category });
    for (const c of s.claims) {
      slides.push({
        kind: "content",
        headline: headlineOf(c.text),
        body: c.text,
        tier: c.tier ?? "forward-looking",
        sourceCaption: captionOf(c),
        chart: selectChart(c.metrics) ?? undefined,
        callout: calloutOf(c),
      });
    }
  }
  slides.push({ kind: "appendix", sources: sourcesOf(report) });
  return slides;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/report/slides.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/report/slides.ts src/report/slides.test.ts
git commit -m "feat(report): buildDeck — claims grouped into a paged slide model"
```

---

### Task 5: Deck HTML renderer

**Files:**
- Create: `src/report/render-deck.ts`
- Test: `src/report/render-deck.test.ts`

**Interfaces:**
- Consumes: `Slide` (Task 1), `themeCss`/`TIER_LABELS` (Task 2), `buildDeck`/`DeckMeta` (Task 4), vendored Chart.js.
- Produces:
  - `type ReportMeta = DeckMeta` (re-exported so the CLI/operator import site is stable).
  - `renderDeck(report: Report, meta: ReportMeta): string` — full self-contained HTML: inlined Chart.js + theme CSS, one `.slide` per `Slide`, tier badges, source captions, footer (`Verity · Mantle RWA` + page number), and a `new Chart(...)` per content slide that has a chart. No CDN/external URLs.

- [ ] **Step 1: Write the failing test**

Create `src/report/render-deck.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderDeck } from "./render-deck.js";
import type { Report } from "../types.js";

const report: Report = {
  question: "Did Mantle RWA growth accelerate in Q2 2026?",
  asOf: "2026-06-17",
  claims: [
    { id: "c1", text: "RWA TVL reached $247.5M (+27%).", forwardLooking: false, tier: "verified",
      category: "tokenized-treasuries",
      metrics: [{ label: "Q1 2026 TVL", value: 195_000_000, provenance: { kind: "dune", queryId: 42, column: "tvl", row: 0 } },
                { label: "Q2 2026 TVL", value: 247_500_000, provenance: { kind: "dune", queryId: 42, column: "tvl", row: 1 } }] },
  ],
};

describe("renderDeck", () => {
  it("renders a self-contained landscape deck with badges, captions, footer, and charts", () => {
    const html = renderDeck(report, { attestationTx: "0xabc", cost: { estimateUsd: 0.2, actualUsd: 0.18, timeSavedHours: 4 } });
    expect(html).toContain("Did Mantle RWA growth accelerate in Q2 2026?");
    expect(html).toContain("RWA TVL reached $247.5M");
    expect(html).toContain("Dune #42");                 // source caption
    expect(html).toContain("Verity · Mantle RWA");      // footer brand
    expect(html).toContain("Verified");                 // tier badge label
    expect(html).toContain("0xabc");                    // attestation in appendix
    expect(html).toContain("new Chart(");               // chart panel
    expect(html).not.toContain("cdn.jsdelivr.net");     // no CDN
    expect(html).not.toContain("http://");              // no external http assets
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/render-deck.test.ts`
Expected: FAIL — cannot find module `./render-deck.js`.

- [ ] **Step 3: Write the implementation**

Create `src/report/render-deck.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { Report, Slide, ChartSpec, RwaCategory } from "../types.js";
import { themeCss, TIER_LABELS } from "./theme.js";
import { buildDeck, type DeckMeta } from "./slides.js";

export type ReportMeta = DeckMeta;

const CHART_JS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../node_modules/chart.js/dist/chart.umd.js"),
  "utf8",
);

function escapeHtml(s: string | undefined | null): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function titleCase(cat: RwaCategory): string {
  return cat.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function footer(page: number, total: number): string {
  return `<div class="footer"><span>Verity · Mantle RWA</span><span>${page} / ${total}</span></div>`;
}

function chartScript(id: string, chart: ChartSpec): string {
  return `<script>new Chart(document.getElementById('${id}'),{type:'${chart.type}',` +
    `data:{labels:${JSON.stringify(chart.labels)},datasets:[{label:'',data:${JSON.stringify(chart.values)},` +
    `backgroundColor:['#1f6f8b','#123a63','#b8860b','#1a7f4b','#6b7280'],borderColor:'#123a63',fill:false}]},` +
    `options:{animation:false,plugins:{legend:{display:${chart.type === "doughnut"}}}}});</script>`;
}

function renderSlide(slide: Slide, page: number, total: number, charts: string[]): string {
  switch (slide.kind) {
    case "cover":
      return `<section class="slide cover"><div class="kicker">Verity · Verification-first RWA research</div>` +
        `<h1>${escapeHtml(slide.title)}</h1><div class="asof">Data as of ${escapeHtml(slide.asOf)}</div></section>`;
    case "toc": {
      const items = slide.sections
        .map((s) => `<li><b>${s.numeral}.</b> ${escapeHtml(titleCase(s.category))} <span class="pages">${s.pageRange}</span></li>`)
        .join("");
      return `<section class="slide toc"><h2>Contents</h2><ol>${items}</ol>${footer(page, total)}</section>`;
    }
    case "divider":
      return `<section class="slide divider"><div class="numeral">${slide.numeral}</div>` +
        `<h2>${escapeHtml(titleCase(slide.category))}</h2>${footer(page, total)}</section>`;
    case "content": {
      let panel = "";
      if (slide.chart) {
        const id = `chart${page}`;
        panel = `<div class="panel"><canvas id="${id}"></canvas></div>`;
        charts.push(chartScript(id, slide.chart));
      }
      const callout = slide.callout ? `<div class="callout">${escapeHtml(slide.callout)}</div>` : "";
      return `<section class="slide content"><span class="badge ${slide.tier}">${escapeHtml(TIER_LABELS[slide.tier])}</span>` +
        `<h1>${escapeHtml(slide.headline)}</h1>${panel}<div class="body">${escapeHtml(slide.body)}</div>${callout}` +
        `<div class="caption">${escapeHtml(slide.sourceCaption)}</div>${footer(page, total)}</section>`;
    }
    case "appendix": {
      const items = slide.sources
        .map((s) => `<li><b>${escapeHtml(s.label)}</b> — ${escapeHtml(s.detail)}</li>`)
        .join("");
      return `<section class="slide appendix"><h2>Sources (re-runnable)</h2><ul>${items}</ul>${footer(page, total)}</section>`;
    }
  }
}

/** Render the full landscape deck to self-contained HTML (Chart.js + theme inlined, no CDN). */
export function renderDeck(report: Report, meta: ReportMeta): string {
  const slides = buildDeck(report, meta);
  // Append the attestation + cost line into the appendix slide's section at render time.
  const total = slides.length;
  const charts: string[] = [];
  const body = slides.map((s, i) => renderSlide(s, i + 1, total, charts)).join("");
  const attestation =
    `<section class="slide appendix"><h2>Attestation & Cost</h2><ul>` +
    `<li><b>ERC-8004 (Mantle)</b> — tx ${escapeHtml(meta.attestationTx)}</li>` +
    `<li><b>Compute</b> — est $${meta.cost.estimateUsd.toFixed(2)} · actual $${meta.cost.actualUsd.toFixed(2)} · ~${meta.cost.timeSavedHours}h saved vs manual</li>` +
    `</ul>${footer(total + 1, total + 1)}</section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Verity — ${escapeHtml(report.question)}</title>` +
    `<script>${CHART_JS}</script><style>${themeCss()}</style></head><body>${body}${attestation}${charts.join("")}</body></html>`;
}
```

> The attestation tx is rendered as text (not a link) to satisfy the `no http://` offline-asset assertion; the on-chain anchor is the trust source, not a clickable URL.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/report/render-deck.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/report/render-deck.ts src/report/render-deck.test.ts
git commit -m "feat(report): render landscape deck HTML (badges, captions, charts, appendix)"
```

---

### Task 6: Landscape PDF + CLI swap + retire render-html

**Files:**
- Modify: `src/report/generate-pdf.ts`
- Modify: `src/cli.ts`
- Delete: `src/report/render-html.ts`, `src/report/render-html.test.ts`
- Test: none new — verified by the offline `--fixture` run + full suite + tsc.

**Interfaces:**
- Consumes: `renderDeck` + `ReportMeta` (Task 5).
- Produces: `htmlToPdf` honoring the deck's `@page` landscape sizing; the CLI's `renderPdf` builds the deck via `renderDeck`.

- [ ] **Step 1: Switch the PDF generator to landscape / CSS page size**

In `src/report/generate-pdf.ts`, replace the `page.pdf(...)` call so the deck's `@page` rule drives sizing:

```ts
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, landscape: true });
```

(Leave the `setContent` + `waitForTimeout(600)` chart-paint wait as-is.)

- [ ] **Step 2: Point the CLI at the deck renderer**

In `src/cli.ts`, change the import:

```ts
import { renderDeck, type ReportMeta } from "./report/render-deck.js";
```

(Remove the `import { renderReportHtml, type ReportMeta } from "./report/render-html.js";` line.)

And in the `renderPdf` helper, swap the renderer:

```ts
async function renderPdf(report: Report, meta: ReportMeta): Promise<string> {
  await htmlToPdf(renderDeck(report, meta), outPdf);
  return outPdf;
}
```

- [ ] **Step 3: Delete the retired single-page renderer + its test**

```bash
git rm src/report/render-html.ts src/report/render-html.test.ts
```

- [ ] **Step 4: Verify typecheck, full suite, and the offline deck render**

Run:
```bash
npx tsc --noEmit && npx vitest run && node --import tsx src/cli.ts --fixture
```
Expected: tsc clean; all tests pass (render-html cases gone, theme/charts/slides/render-deck cases present); the fixture run prints `"passed": true` with a `pdfPath` and a `simulated-0x…` attestation. Open `examples/mantle-rwa-q2-2026.pdf` — it is now a multi-page landscape deck (cover → TOC → dividers → content with badges + charts → sources/attestation). No network, no keys.

- [ ] **Step 5: Commit**

```bash
git add src/report/generate-pdf.ts src/cli.ts examples/mantle-rwa-q2-2026.pdf
git commit -m "feat(report): landscape PDF + CLI deck render; retire single-page render-html"
```

---

## Self-Review

**Spec coverage (`2026-06-18-verity-v2-mantle-rwa-specialist-design.md` §6 + §3 + §7):**
- Content → slide → HTML → landscape PDF pipeline, pure except Playwright → Tasks 4–6. ✓
- `theme.ts` (serif display + sans body, gradient, tier-badge colors, footer) → Task 2. ✓
- `slides.ts` `buildDeck(report, meta): Slide[]`, group by category → Task 4. ✓
- `render-deck.ts` replaces `render-html.ts` → Tasks 5–6. ✓
- `charts.ts` type selection (time-series→line, comparative→bar, composition→doughnut) → Task 3. ✓
- `generate-pdf.ts` landscape + `@page` sizing → Task 6. ✓
- `Slide` union in `types.ts` → Task 1. ✓
- Deck content: cover, TOC (Roman numerals + page ranges), per-category dividers, content slides (serif H1, body, chart panel, callout, tier badge, source caption, footer + page #), sources appendix → Tasks 4–5. ✓
- Constraints: programmatic visuals only, no external assets, every slide traces to a gated claim → enforced (claims-only content; `no http://` test) Tasks 5–6. ✓

**Deferred / not in scope (intentional):** `discovered` quarantine list is not rendered as deck slides (spec §6 keeps the deck claims-only; discovery surfaces in `ResearchOutput`/telemetry from Plan 2). A future iteration may add a "watchlist" appendix. The global-vs-Mantle side-by-side display (spec §4) is satisfied by the metrics/labels the synthesizer already emits per claim — no extra deck structure needed because the gate already enforces the labeling.

**Placeholder scan:** none — every code/test step has literal content. Two intentional inline corrections are flagged for the implementer (the `#5b6personally` → `#5b6470` typo in Task 2; attestation rendered as text not a link in Task 5).

**Type consistency:** `ChartSpec {type,labels,values}` identical in Tasks 1, 3, 5; `Slide` union shape identical in Tasks 1, 4, 5; `DeckMeta`/`ReportMeta` (`{attestationTx, cost{estimateUsd,actualUsd,timeSavedHours}}`) identical in Tasks 4, 5 and matches the operator's `renderPdf` meta and the existing fixture/live call sites; `selectChart(metrics): ChartSpec | null` and `buildDeck(report, meta): Slide[]` and `renderDeck(report, meta): string` signatures match across definition and call sites; `TIER_COLORS`/`TIER_LABELS` keyed by the three `ClaimTier` values from `src/types.ts`.
```
