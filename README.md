# Verity

> A research agent that refuses to publish until every important claim can be traced, verified, scored, and attested onchain.

Track 2 submission for the **Mantle Research Challenge**. Verity is a *verification-first* onchain-finance research agent: it gathers data (Dune) + context (Exa), synthesizes claims that each carry provenance, then **hard-gates** the output through a deterministic checker before rendering a PDF and anchoring its hash to ERC-8004 on Mantle.

## Why it's different
The field is full of "AI research agents" competing on autonomy and speed. Verity competes on **trust**. Every number must equal its source value (checked by code, never by an LLM), every address must be on a hand-verified allowlist, and nothing un-verified is ever published or attested.

**Where trust actually comes from:** the public, re-runnable Dune query IDs + the recomputable PDF hash. The on-chain attestation is a timestamp/anchor — not the source of trust.

## Pipeline
```
        User question / claim
                  |
                  v
        Operator (plan + cost estimate)
                  |
                  v
        Scouts  -- onchain-finance-scout (allowlist -> Dune)
                +- web-scout (Exa / Firecrawl)
                  |   (summaries + query IDs + sources)
                  v
        Synthesizer  -> draft claims, each with provenance + confidence
                  |
                  v
   +------ Verification Gate (HARD) ------+
   |  (a) Deterministic provenance checker |  <- the spine
   |  (b) Configurable LLM-as-judge (qual.)|
   +---------------+-----------------------+
            pass    |    fail -> back to synth/scout
                    v
        Report builder -> PDF (charts, sources, confidence, cost)
                  |
                  v
        Attestation -> recompute hash -> ERC-8004 Validation Registry (Mantle)
```

## Run it
1. `npm install && npx playwright install chromium`
2. Copy `.env.example` → `.env`, fill keys (Dune, Exa, Anthropic, Mantle).
3. **Offline demo (no keys needed):** `npx tsx src/cli.ts --fixture` → writes `examples/mantle-rwa-q2-2026.pdf`.
4. **Register the agent (once):** `npx tsx src/attest-8004/register.ts` → mints the ERC-8004 agentId on Mantle and prints `VERITY_AGENT_ID` + `VERITY_VALIDATOR_ADDRESS` to paste into `.env`.
5. **Live:** set `VERITY_QUERY_IDS=<comma,separated,dune,ids>`, then `npx tsx src/cli.ts "your question"`.

## How it's built
TypeScript + vitest, fully TDD. Spine = `src/verify/provenance-checker.ts` (deterministic). See `docs/superpowers/` for the full design + plan. Packaged as a Mantle Agent Skill (`SKILL.md`).

## Live example
The checked-in `examples/mantle-rwa-q2-2026.pdf` answers *"Did Mantle's RWA growth actually accelerate in Q2 2026, and are tokenized-equity adoption claims supported onchain?"* — with confidence scores, re-runnable Dune sources, a cost panel, and an attestation anchor.

## Status / roadmap
v1 uses a hand-verified address allowlist and a Mantle attestation anchor (confirm the ValidationRegistry address on mantlescan.xyz before live use). Roadmap: dynamic verified resolution, per-run + reputation attestation, autonomous loop/goal, multi-model worker fan-out, real x402 pay-to-run.

## Submission checklist (manual)
- [ ] Push repo public
- [ ] Publish X thread tagging @Mantle_Official; follow + like/share the campaign article
- [ ] Join the Mantle creators Discord
- [ ] Submit the participation form with the correct wallet address
