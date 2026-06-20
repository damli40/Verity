# Verity v3 — Multi-Source Discovery, Verification & Narrative

**Date:** 2026-06-20
**Status:** Approved (brainstorm), pending implementation plans
**Supersedes scope of:** the v2 "Mantle RWA specialist" work (Plans 1–3, complete). v3 builds on that foundation.

## Problem

The shipped report is effectively single-source. `synthesizer.ts` literally instructs the model that
Dune is "the ONLY source for numbers"; web/Exa is "qualitative context + citation URLs" only; there is
no second on-chain data provider. Two consequences:

1. **No real cross-verification.** A figure is "Verified" because it equals a Dune cell — there is no
   independent on-chain source agreeing with it. The only "second source" is a string-match against an
   allowlisted scrape (the Corroborated tier).
2. **No real discovery.** USDY and mUSD are hand-typed into `data/allowlist.json`. The discovery
   subsystem (`registry-scout → match-onchain → {verified, quarantined}`) is a skeleton whose inputs are
   stubbed: in `cli.ts` the live path uses `fetchCandidates = async () => []` and `lookup = () => null`,
   so `matchOnchain` always returns empty. `RwaCandidate` carries no address field, so even a populated
   candidate could not be resolved. There are more RWAs on Mantle than USDY/mUSD (MI4/Securitize,
   Syrup USDT/Maple, xStocks), and the agent cannot currently find any of them.

Verity now has four MCP servers wired in the authoring session — Dune, Nansen, Firecrawl, Exa. These let
the agent (a) discover candidate RWAs from registries + on-chain, (b) cross-verify numbers across two
independent on-chain providers (Dune **and** Nansen), and (c) author Dune-native charts. The standalone
Node pipeline cannot call MCP tools at runtime, so the design distinguishes what the authoring session
does from what the autonomous pipeline reproduces via REST clients.

## Goals

- Discover the full Mantle RWA set automatically, not just two hand-typed tokens — without ever trusting
  an address that is not traceable to the issuer's own official source (Cardinal Rule §5).
- Cross-verify numeric claims across Dune **and** Nansen; surface disagreement explicitly.
- Add the dimensions Dune transfer data cannot show — holder counts, holder concentration, smart-money
  inflows/outflows — via Nansen, each carrying Nansen provenance.
- Produce a genuinely well-written, multi-source report (the flagship artifact) AND upgrade the pipeline
  so it can reproduce that class of report autonomously.
- Keep every guarantee in `CLAUDE.md` §5: numbers validated programmatically against source cells, never
  by the LLM; addresses only from traceable provenance; the report PDF stays self-contained, offline, and
  hash-stable (keccak256 recomputes == on-chain requestHash).

## Non-Goals

- The autonomous pipeline calling MCP tools at runtime (MCPs are authoring-session tools only).
- Live Dune-chart URLs / iframes in the PDF (breaks self-contained + hash-stable).
- Replacing Dune as a number source. Dune and Nansen are co-equal independent providers.
- Promoting an asset to "verified" from a registry claim alone, or from an unknown issuer with no
  official-source confirmation.

## Decisions (locked during brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Deliverable | **Both** — flagship report produced now via MCPs + attested, AND pipeline upgraded to reproduce it. |
| 2 | Cross-source verification model | **Agreement-tiered.** Cross-verified = matches in Dune AND Nansen within tolerance; Verified = matches one on-chain source; Corroborated = web/scrape only; disagreements flagged, never averaged. |
| 3 | Dune-native charts in the report | **Bake static image bytes.** Dune MCP authors the visualization → render to static PNG/SVG → embed inline. Self-contained, offline, hash-stable. Appendix links the live Dune query for re-running. |
| 4 | Report subject | The Mantle RWA-growth question, **broadened to the full auto-verified discovered RWA set** (not just USDY/mUSD). USDY/mUSD remain the deepest-data anchor cases; quarantined assets are named but never numerically cited. |
| 5 | Discovery promotion trust posture | **Auto-verify on issuer-source ∩ on-chain agreement.** A discovered asset auto-promotes to verified when its address is confirmed by the issuer's own official source (allowlisted domain) AND matches a real on-chain ERC-20. Unknown issuers with no official-source confirmation stay quarantined for human review. |
| 6 | On-chain provider fallback | **Etherscan/Mantlescan as the fallback when Nansen lacks coverage.** Etherscan-family API for Mantle (Mantlescan, or Etherscan V2 multichain with `chainid=5000`) supplies token supply + contract confirmation for free, keeping cross-verification two-sourced (Dune + Etherscan) when Nansen does not index a token. Holder count/list is an Etherscan Pro (paid) endpoint, so Etherscan backstops supply + confirmation but does not replace Nansen's holder-concentration / smart-money dimensions. |

## Architecture

### A. Discovery funnel

Replace the two stubs (`fetchCandidates`, `lookup`) behind the existing `registry-scout → match-onchain`
seam. Three stages:

**Stage 1 — Cast a wide net (`fetchCandidates`).** Union across independent sources, deduped by resolved
address:

1. **Firecrawl `extract`** over RWA registries — DefiLlama (RWA category filtered to Mantle), rwa.xyz,
   `app.mantle.xyz` ecosystem, Messari — into `{name, issuer, category, networks, claimedAddress, sourceUrl}`.
2. **Dune MCP `searchDuneDashboards` / `searchTables`** — harvest tokens already tracked by community
   "Mantle RWA" dashboards plus on-chain ERC-20 metadata tables.
3. **On-chain issuer-deployer enumeration (a Dune query)** — every ERC-20 deployed by known RWA-issuer
   addresses on Mantle. Catches assets registries lag on.
4. **Nansen `token_discovery_screener` / `general_search`** (chain=mantle) — on-chain token discovery
   carrying Nansen entity labels (Securitize, Ondo, …).
5. **Exa search** — recent "tokenized … launched on Mantle" pages to catch brand-new issuers no registry
   lists yet.

**Stage 2 — Resolve to a *trusted* address (`lookup`).** The Cardinal-Rule-critical step. A candidate
name resolves to a contract address only via the **issuer's own official source** (a domain carrying the
new `issuer-official` role in `source-allowlist.json`, e.g. `docs.ondo.finance/addresses`), then confirmed
on-chain through Dune (real ERC-20; sane name/symbol/supply), with **Nansen `token_info` or, when Nansen
lacks coverage, Etherscan/Mantlescan** as the independent confirmation. A registry's `claimedAddress` is
believed only if it equals the issuer-official address.

**Stage 3 — Verify-or-quarantine (`matchOnchain`, largely unchanged).** Resolved address confirmed by an
issuer-official source AND present on-chain → **verified** (gets numeric claims + Dune/Nansen tracking).
Everything else → **quarantined**: named in the report as "discovered, not yet verified," never numerically
cited. A human promotes a quarantined asset by adding it to `data/allowlist.json` after eyeballing the
issuer source.

**Types delta:** `RawCandidate`/`RwaCandidate` gain `claimedAddress?: string` and `sourceUrl?: string`.
`SourceAllowlistEntry` roles gain `"issuer-official"`. `matchOnchain` auto-promotes a resolved candidate
to a synthesized `verified` `AllowlistEntry` when (and only when) the resolver confirms it against an
issuer-official source — this is the only behavioral change to the never-auto-promote rule, and it is
gated on issuer-source agreement, not a bare registry claim.

### B. Multi-provider verification spine (Approach A)

- **`ProvenanceRef`** generalizes from Dune-only to a discriminated union:
  - `{ kind: "dune", queryId, column, row }` (existing)
  - `{ kind: "nansen", endpoint, field, address, chain }` (new)
  - `{ kind: "etherscan", endpoint, field, address, chain }` (new — fallback on-chain provider)
- **`src/scouts/nansen-scout.ts`** — injected REST client returning a structured `NansenResultRef[]`
  (holders, concentration, segment flows, token info), analogous to the Dune scout. External I/O injected
  for unit-testability per §6.
- **`src/scouts/etherscan-scout.ts`** — injected Etherscan/Mantlescan REST client (Etherscan V2,
  `chainid=5000`) returning token supply + contract-confirmation fields. Used as the second on-chain source
  for cross-verification **when Nansen does not index a token**; supply + confirmation are free-tier,
  holder count is best-effort (Pro endpoint).
- **`src/verify/onchain-checker.ts`** — re-validates a `kind:"nansen"` or `kind:"etherscan"` metric against
  the live provider response, mirroring `provenance-checker.ts`. Fails closed on a missing/mismatched field.
- **`src/verify/cross-check.ts`** — pairs metrics asserting the same quantity across providers; stamps the
  top **Cross-verified** tier only when two independent on-chain sources (Dune + Nansen, or Dune + Etherscan
  when Nansen is absent) agree within a declared tolerance (e.g. ±1%, stated in the report); emits an
  explicit `disagreement` flag otherwise. Never averages.
- **Tier order becomes:** Cross-verified ▸ Verified ▸ Corroborated ▸ Forward-looking. `deriveTier` and the
  tier badges/theme extend to the new top tier.
- **`runGate`** threads the Nansen scout result + cross-check alongside the existing Dune checker. A
  numeric claim still cannot pass on the LLM's say-so — every figure is re-checked against its provider's
  cell programmatically.

### C. Narrative quality

- `buildSynthesisPrompt` is fed all three structured sources (Dune rows + Nansen metrics + web snippets)
  with explicit per-source provenance rules, and is required to emit `claim.category` (so the deck renders
  real sections instead of a single "other" bucket).
- A prose layer — executive summary + per-section intros — is generated and scored by the LLM judge for
  qualitative quality (coverage, reasoning, contradiction) only. It carries no numbers; the judge never
  validates a figure (§5).
- Per verified asset, the report shows Dune (supply/volume/QoQ) + Nansen (holder count, concentration,
  smart-money net flow), cross-verified where the quantities overlap.

### D. Dune-native charts, baked as static bytes

- **Flagship report (authoring session):** Dune MCP `generateVisualization` → `renderVisualization` →
  static PNG/SVG → embedded inline in the PDF. Genuinely Dune-authored, hash-stable.
- **Autonomous pipeline:** keeps the existing pure inline-SVG renderer (`chart-svg.ts`), now fed by the
  verified multi-source metrics, plus an optional "embed a pre-rendered Dune image when a visualization id
  is configured" hook. The pipeline never pretends to call an MCP it cannot reach.
- Either path stays self-contained (no external `src=`, no `<script>`), so keccak256 recomputes.

## Data Flow

```
question
  ├─ discovery: fetchCandidates (Firecrawl + Dune MCP + Dune deployer query + Nansen screener + Exa)
  │     → lookup (issuer-official source ∩ on-chain confirm) → matchOnchain → {verified[], quarantined[]}
  ├─ scouts: Dune (supply/volume) ‖ Nansen (holders/concentration/flows) [‖ Etherscan supply when Nansen absent] ‖ web (Exa) ‖ scrape (corroboration)
  ├─ synthesize: provenance-tagged claims (dune|nansen|etherscan), categories, prose layer  → SynthesisResult
  ├─ verify gate:
  │     provenance-checker (dune cells)  ‖  onchain-checker (nansen|etherscan fields)  → cross-check (agreement → tier/flag)
  │     → LLM judge (qualitative only)
  ├─ confidence: deriveSignals (multi-provider quality/agreement/freshness) → score
  ├─ render ONCE: landscape deck (sections by category, tier badges incl. Cross-verified, baked charts,
  │     quarantined-assets appendix, re-runnable Dune URLs)
  └─ hash + attest (ERC-8004 ValidationRegistry, Mantle) — tx never embedded
```

## Error Handling & Cardinal-Rule Guarantees

- **Nansen coverage is not assumed.** The first implementation task probes Nansen for USDY/mUSD on Mantle;
  if a token is not indexed, the cross-verification second source falls back to **Etherscan/Mantlescan**
  (supply + contract confirmation), keeping the figure two-sourced (Dune + Etherscan = Cross-verified). If
  neither Nansen nor Etherscan covers it, the figure falls back to single-source Verified (Dune) and the
  report says so — provider absence never silently drops a claim or fabricates a figure.
- **Fail-closed everywhere:** a metric with missing/invalid provenance (dune or nansen) fails the gate, as
  today. Cross-check disagreement does not silently pick a winner — it downgrades the tier and flags it.
- **No invented addresses:** discovery promotes only on issuer-official ∩ on-chain agreement; everything
  else quarantines.
- **Hash-stable PDF:** render once; charts baked as static bytes; tx never embedded.

## Testing

- TDD per §6: failing test → fail → minimal impl → pass → commit. External I/O injected.
- New unit tests: `parseCandidates` with `claimedAddress`/`sourceUrl`; `lookup` resolution (issuer match,
  registry-claim-vs-official mismatch rejected, unknown issuer → null); `matchOnchain` auto-promote only on
  issuer-source agreement; `nansen-scout` + `etherscan-scout` shapers; `onchain-checker` (pass, fail on
  mismatch, fail-closed on missing field, for both nansen + etherscan kinds); `cross-check` (Dune+Nansen
  agreement → Cross-verified, Dune+Etherscan fallback → Cross-verified, disagreement → flag, single-source
  → Verified); `deriveTier`/theme for the new tier; synthesizer category emission.
- Backward compatibility: the offline `--fixture` path must stay green and continue to render an attested
  deck with zero API keys. Fixtures extended with Nansen cells + a discovered/quarantined example.

## Decomposition (one spec, three plans)

- **Plan 1 — Discovery funnel.** Types delta; `issuer-official` role; real `fetchCandidates` (Firecrawl +
  Dune harvest + deployer enumeration + Nansen screener + Exa) and `lookup` resolver; `matchOnchain`
  auto-promote on issuer-source agreement; CLI wiring; tests.
- **Plan 2 — Multi-provider verification + cross-check.** `ProvenanceRef` union (dune|nansen|etherscan);
  `nansen-scout` + `etherscan-scout` (fallback); `onchain-checker`; `cross-check` with Etherscan fallback
  when Nansen is absent; Cross-verified tier through `deriveTier`/theme/gate; confidence signals across
  providers; tests.
- **Plan 3 — Narrative + Dune charts + flagship run.** Synthesizer multi-source prompt + categories +
  prose layer; judge qualitative scoring of prose; baked Dune-native charts (flagship) + pipeline SVG hook;
  full flagship live run over the discovered Mantle RWA set + re-attestation.

Each plan: TDD, commit per task, `--fixture` green throughout, handoff updated per §7.
