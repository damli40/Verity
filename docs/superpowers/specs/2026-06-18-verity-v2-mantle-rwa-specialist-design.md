# Verity v2 — Mantle RWA Specialist: Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorming complete) — ready for implementation plan
**Supersedes scope of:** `2026-06-17-verity-onchain-research-agent-design.md` (v1 pipeline stays; this extends it)

## 1. Goal & Scope

Upgrade Verity from a single-question, single-table generator into **the Mantle RWA specialist**: an on-demand, verification-first research agent that discovers, categorizes, and reports on Mantle's real-world-asset ecosystem, producing a Delphi-grade landscape deck whose every number is either deterministically **Verified** (Dune) or **Corroborated** (allowlisted, freshly-scraped, string-matched) — never invented.

**In scope:** Mantle RWA only. One vertical, done authoritatively.
**Out of scope (future iterations):** other chains; general crypto topics; auto-promotion of discovered assets to `verified` without human review.

The v1 invariants are unchanged and remain cardinal:
- The deterministic provenance checker is the spine; the LLM never validates a number.
- Trust = re-runnable Dune query IDs + recomputable PDF hash; the ERC-8004 tx only anchors/timestamps.
- Addresses come only from the hand-verified allowlist; off-list ⇒ rejected.

## 2. Architecture & Data Flow

One-shot, on-demand. Existing pipeline retained; new stages in **bold**.

```
operator (orchestrator)
  1. DISCOVER (new) ─ registry-scout → match-onchain
        → verified (allowlisted) assets  vs  quarantined candidates
  2. SCOUT ─┬─ onchain: Dune queries scoped to verified, categorized contracts
            └─ web: scrape allowlisted sources (fresh) → page text + figures
  3. SYNTHESIZE (gpt-5) → claims tagged {category, provenance}
  4. GATE (two-tier) + qualitative LLM judge
        • Verified     = deterministic Dune cell match
        • Corroborated = allowlisted domain + figure string-found in fresh scrape + ≤ TTL
        • Forward-looking / Quarantined = no gated number
  5. REPORT ENGINE (new) → landscape themed deck (HTML → Playwright PDF)
  6. ATTEST → ERC-8004 hash of final PDF on Mantle (unchanged)
```

All external I/O (Dune, Exa, Firecrawl scrape, LLM, viem) is injected so logic stays unit-testable without network. `--fixture` path never hits the network and renders a recomputable-hash PDF with zero keys.

## 3. Components (one responsibility each)

| File | Responsibility |
|---|---|
| `data/allowlist.json` | Contract allowlist; each entry gains `category` + `status` (`verified` \| `quarantined`). |
| `data/source-allowlist.json` | Trusted web domains with `roles: ["discovery" \| "corroboration"]`. |
| `src/discovery/registry-scout.ts` | Scrape discovery-role domains → normalize to candidate `{name, issuer, category}` (pure parse separated from fetch). |
| `src/discovery/match-onchain.ts` | Resolve candidates to live Mantle contracts (injected lookup); classify `verified`-eligible vs `quarantined`. Never auto-promotes to `verified`. |
| `src/cache/` | On-demand fetch with TTL for Dune results + scrapes. |
| `src/verify/provenance-checker.ts` | Extend with `checkScrapeMetric` (Corroborated tier) + tier derivation. |
| `src/verify/source-allowlist.ts` | Loader + role checks (mirror of contract `allowlist.ts`). |
| `src/report/theme.ts` | Design tokens + base CSS (serif display + sans body, gradient palette, tier-badge colors, footer). |
| `src/report/slides.ts` | `buildDeck(report, meta): Slide[]` — pure; groups claims by category. |
| `src/report/render-deck.ts` | `renderDeck(slides): string` — pure HTML; replaces `render-html.ts`. |
| `src/report/charts.ts` | Chart.js type selection from metric shape; emits canvas + config. |
| `src/report/generate-pdf.ts` | Playwright landscape + `@page` sizing (extend existing). |
| `src/types.ts` | Data-model deltas (below). |
| `src/operator.ts` | Wire discovery stage + two-tier gate. |

## 4. Verification Model (the core)

`ProvenanceRef` becomes a three-kind union:
- `{ kind: "dune", queryId, column, row }` → **Verified** (unchanged; deterministic, recomputable).
- `{ kind: "scrape", domain, url, figure, scrapedAt }` → **Corroborated** (new).
- `{ kind: "source", url }` → context only; never carries a gated number.

`checkScrapeMetric` admits a scrape number **iff all** hold (code does each check, never the LLM):
1. `domain` is on `source-allowlist.json` **with the `corroboration` role** (off-list / discovery-only ⇒ reject).
2. The metric value, after light unit normalization (`$`, `M`/`B`, commas → canonical), is found by **strict string match** in the page text captured *this run*. (No fuzzy/rounding tolerance — a scrape attests "we literally saw this string," not a computation. If the figure didn't render, it cannot corroborate.)
3. `scrapedAt` within the freshness **TTL = 45 days** of `report.asOf` (same rule as Dune `executedAt`).

`Claim.tier` is derived deterministically after the gate: `verified` if every numeric metric is Dune; `corroborated` if it relies on a passing scrape metric; `forward-looking` otherwise. **Quarantined** assets can only ever produce forward-looking claims — their address isn't on the verified contract allowlist, so the existing address check rejects any number tied to them.

**Accuracy rule (global vs Mantle) — enforced, not advisory:** a global / cross-network AUM figure (e.g. rwa.xyz asset-screener) may appear **only** as Corroborated **and explicitly labeled "global, all-network."** The **Mantle-specific** number must come from a Dune per-contract query (Verified) or a Mantle-specific aggregate source (rwa.xyz networks page). The gate rejects a claim that presents a global figure as the Mantle figure. The report shows both side by side.

## 5. Discovery, Allowlist & Taxonomy

**RWA categories:** `tokenized-treasuries`, `tokenized-equities`, `index-fund`, `private-credit`, `commodities`, `real-estate`, `other`.

**Discovery = registry cross-reference:** scrape discovery-role domains (rwa.xyz screener + networks, DefiLlama RWA, Messari, mantle.xyz), extract candidate `{name, issuer, category, networks}`, then `match-onchain` resolves each to a live Mantle contract. Found + sanity-checked ⇒ eligible for `verified` **after human review**; otherwise ⇒ `quarantined` (mentionable, never numerically cited).

**Source roles:**
```json
[
  { "domain": "app.rwa.xyz",      "roles": ["discovery"] },
  { "domain": "defillama.com",    "roles": ["discovery", "corroboration"] },
  { "domain": "messari.io",       "roles": ["discovery", "corroboration"] },
  { "domain": "mantle.xyz",       "roles": ["corroboration"] },
  { "domain": "docs.ondo.finance","roles": ["corroboration"] }
]
```
rwa.xyz is **discovery-only** because its figures are API-gated and usually don't render (confirmed via Firecrawl test 2026-06-18) — so they can't pass strict string-match, which is correct.

**Seed data captured 2026-06-18 (for fixtures; live agent must re-scrape fresh):**
- rwa.xyz Networks → Mantle: **RWA Count 160, RWA Value (Distributed) $241,080,948, 100% distributed, RWA Holders 3,264**; stablecoins on Mantle: 1, $5,152,396 mcap, 30,992 holders.
- rwa.xyz Mantle asset list (AUM = **global**): USDY/Ondo (treasuries, $2.15B global), MI4/Securitize (index, **$117,230,2xx — Mantle-only**, mgmt 1.00%, inception 2025-04-15), Syrup USDT/Maple (credit, $368.5M global), xStocks suite (Tesla/Circle/SP500/NVIDIA/Nasdaq/MicroStrategy/Alphabet/Strategy-PP, stocks, $27–125M global).
- Verified on-chain (Dune 7749240): USDY Mantle supply ~$25.9M; mUSD ~$57.7K.

## 6. Report (Deck) Engine

Content model → slide model → HTML → landscape PDF. Pure except the Playwright step.

`buildDeck` emits: **cover** (gradient + serif title + date) · **TOC** (Roman-numeral categories + page ranges) · **section divider per category** · **content slides** (serif H1 = claim headline · body prose · auto Chart.js panel · stat/pull-quote callout · **tier badge** Verified=green / Corroborated=amber / Forward-looking=grey · source caption e.g. "Dune #7749240" or "rwa.xyz networks, scraped 2026-06-18" · footer `Verity · Mantle RWA` + page #) · **sources appendix** (re-runnable Dune IDs + scraped URLs + scrape dates).

**Constraints:** programmatic visuals only (CSS gradients/theme, no external photos) so offline render + recomputable hash hold; every slide traces to a gated claim (no decorative filler implying unbacked analysis).

`charts.ts` picks type from metric shape: time-series → line; categorical/comparative → bar; composition → doughnut.

## 7. Data-Model Deltas (`src/types.ts`)

- `AllowlistEntry` += `category: RwaCategory`, `status: "verified" | "quarantined"`.
- `Claim` += `category: RwaCategory`, `tier: "verified" | "corroborated" | "forward-looking"`.
- `ProvenanceRef` += `{ kind: "scrape", domain, url, figure, scrapedAt }`.
- New: `SourceAllowlistEntry { domain, roles }`, `RwaCandidate { name, issuer, category, networks }`, `Slide` union.

## 8. Testing Strategy

TDD throughout (failing test → impl → pass → commit); external I/O injected.

**Unit:** source-allowlist roles; **scrape-metric gate** (passes on figure-found+corroboration-role+fresh; rejects on figure-absent, discovery-only domain, stale, and global-as-Mantle); tier derivation; discovery parse + match-onchain classification (injected lookups); `buildDeck` grouping; `renderDeck` contains badges/dividers/captions/footers/page-numbers; chart-type selection.
**Integration:** operator wiring — discovery runs; gate-pass ⇒ renderPdf+attest; gate-fail ⇒ not.
**Offline + real-data gates:** `--fixture` renders the new deck with zero keys + recomputable hash; before any mainnet write, a simulated-attest dry run against real Dune + real scrapes, inspect the deck, then the real attestation.

## 9. Non-Goals / Accepted Follow-ups

- No auto-promotion of discovered assets to `verified` (human-in-loop; future iteration).
- No multi-chain, no non-RWA topics.
- If a registry table is API-gated and figures don't render, it degrades to discovery/qualitative only — by design.
