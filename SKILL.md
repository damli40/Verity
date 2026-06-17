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
