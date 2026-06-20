# Verity — Description

**What it is:** a verification-first onchain-finance research agent. Submission for the **Mantle Research
Challenge, Track 2** (deadline 2026-07-03). Repo: https://github.com/damli40/Verity.

**Thesis:** *verifiable, not faster.* LLM research can't be trusted on numbers, so Verity makes every
figure provable. Trust comes from re-runnable data-source query IDs + a recomputable PDF hash; the on-chain
attestation only timestamps/anchors it.

## Pipeline

```
operator → scouts (Dune REST + Nansen + web/Exa + scrape) → synthesizer (LLM, provenance-tagged claims)
  → two-tier verification gate (deterministic provenance checker + LLM-as-judge for qualitative only)
  → landscape PDF deck (inline-SVG charts, headless Chromium) → ERC-8004 ValidationRegistry attestation (Mantle)
```

## Trust model (the Cardinal Rule, CLAUDE.md §5)

- The **deterministic provenance checker** is the spine: every numeric claim must equal its source cell,
  checked by code — never by the LLM. The judge only assesses qualitative quality.
- Addresses are trusted only when traceable to the issuer's own official source; never invented or
  auto-trusted from a bare registry claim.
- Tiers (v3): **Cross-verified** (agrees across two independent on-chain sources, e.g. Dune + Nansen, or
  Dune + Etherscan fallback) ▸ **Verified** (one on-chain source) ▸ **Corroborated** (web/scrape) ▸
  **Forward-looking**.
- The report PDF is self-contained, offline, and hash-stable: `keccak256(published PDF) == on-chain requestHash`.

## Current status

- **v1:** LIVE + attested on Mantle mainnet (agentId 134; ValidationRegistry `0x8004Cc84…`). Real Dune
  query 7749240 backs the live finding. Honest result: USDY/mUSD RWA adoption did NOT accelerate in
  Q2 2026 (contradicts the bullish "27% RWA growth" headline).
- **v2:** Mantle-RWA specialist (two-tier gate, discovery skeleton, landscape deck). Complete.
- **v3 (in progress):** multi-source discovery + verification + narrative. Spec:
  `docs/superpowers/specs/2026-06-20-verity-v3-multisource-discovery-verification-narrative.md`. Plan 1
  (discovery funnel) is complete + live-verified on branch `verity-v3-plan1-discovery`; Plans 2
  (multi-provider verify + cross-check, Nansen/Etherscan) and 3 (narrative + Dune charts + flagship run)
  are TODO.

## Conventions

- TypeScript/Node/ESM; `tsx` to run, `vitest` to test. Scripts read `process.env` directly — run with
  `node --env-file=.env --import tsx <script>`.
- Living status is in `handoff.md`; the running work log is in `log.md`; this file is the standing
  description. Keep all three current.
