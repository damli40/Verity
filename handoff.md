# Verity — Handoff / Living Status

> **Update this file after every meaningful action** (step/task done, blocker hit, decision made, open question resolved). A fresh agent must be able to resume from this file alone. Append to the log; don't silently rewrite history.

**Last updated:** 2026-06-17 — by: Task 2 execution (address allowlist + loader complete)

---

## TL;DR (read this first)

- **What:** Verity, a verification-first onchain-finance research agent. Mantle Research Challenge, Track 2. Deadline **July 3, 2026**.
- **Where we are:** Design + implementation plan complete and approved. **No code written yet.** Repo dir `verity/` exists with `CLAUDE.md` + this file only.
- **Next action:** Begin **Task 1** (core domain types) in the plan.
- **Spec:** `docs/superpowers/specs/2026-06-17-verity-onchain-research-agent-design.md`
- **Plan:** `docs/superpowers/plans/2026-06-17-verity-onchain-research-agent.md`

## How to resume

1. Read `CLAUDE.md` (esp. §5 Cardinal Rule and §6 Discipline).
2. Read the plan. Find the first unchecked task below.
3. Execute it via TDD (failing test → fail → impl → pass → commit). Update this file when done.

## Task status

| # | Task | Status |
|---|------|--------|
| 0 | Repo scaffold | ☑ done |
| 1 | Core domain types | ☑ done |
| 2 | Address allowlist + loader | ☑ done |
| 3 | **Deterministic provenance checker (spine)** | ☐ |
| 4 | Confidence scorer | ☐ |
| 5 | Dune client | ☐ |
| 6 | onchain-finance-scout (allowlist) | ☐ |
| 7 | web-scout (Exa) | ☐ |
| 8 | Synthesizer (Claude) | ☐ |
| 9 | LLM-as-judge | ☐ |
| 10 | Verification gate | ☐ |
| 11 | Cost transparency | ☐ |
| 12 | Telemetry (PostHog) | ☐ |
| 13 | Report builder (PDF) | ☐ |
| 14 | ERC-8004 attestation | ☐ |
| 15 | Operator orchestrator | ☐ |
| 16 | CLI + cached fixture run | ☐ |
| 17 | SKILL.md + README + submission | ☐ |

Legend: ☐ not started · ◐ in progress · ☑ done

## Open questions / decisions pending

- [ ] **Repo language** — locked to **TypeScript** (Node/ESM, tsx, vitest). Revisit only if blocked.
- [ ] **Mantle ERC-8004 Validation Registry address + ABI** — must confirm on `explorer.mantle.xyz` in **Task 14 Step 1** before any mainnet tx.
- [ ] **Fixture synthesis without `ANTHROPIC_API_KEY`** — decide in Task 16 whether to check in a `fixtures/report.json` so the offline demo runs with zero API keys.

## Decisions log (newest first)

- 2026-06-17 — Attestation target: **Mantle mainnet via the existing Validation Registry** (reversed earlier testnet-only call; Mantle deployed ERC-8004 on 2026-02-16, gas is cheap, more credible).
- 2026-06-17 — Cost feature **simplified** to estimated/actual compute + time-saved (dropped +50% margin & mock invoice).
- 2026-06-17 — v1 uses a **hand-verified address allowlist**; dynamic resolution is roadmap (avoids the resolution-hallucination hole).
- 2026-06-17 — Verification gate split: **deterministic checker (hard, programmatic)** + **configurable LLM judge (qualitative only)**.
- 2026-06-17 — Live example reframed to a **claim that must be proven**: "Did Mantle's RWA growth actually accelerate in Q2 2026, and are tokenized-equity adoption claims supported onchain?"
- 2026-06-17 — Added **cached fixture run** so the demo always renders offline.

## Blockers

- None yet.

## Progress log (append-only)

- 2026-06-17 — Brainstormed + wrote spec; revised after external review (verification engine first, deterministic spine, allowlist, mainnet attestation, confidence scores, simplified cost). Wrote 17-task implementation plan. Created `verity/`, `CLAUDE.md`, `handoff.md`. No source code yet.
- 2026-06-17 — Task 0 complete. Scaffold committed (SHA: 321cfd82d622ea5794b1d61b85f5c673296e5824). Dirs: src/ data/ evals/ fixtures/ examples/ posthog/ docs/superpowers/specs|plans/. Files: package.json, tsconfig.json, vitest.config.ts, .gitignore, .env.example, README.md. npm install: 106 packages (7 audit vulnerabilities, non-blocking). npx playwright install chromium: SUCCESS (Chrome 149 + headless shell downloaded). git identity set locally (Dami / demiladeakins@gmail.com).
- 2026-06-17 — Task 1 complete. Created `src/types.ts` with 10 core domain types: ProvenanceRef, Metric, ConfidenceSignals, Claim, Report, DuneResultRef, AllowlistEntry, CheckFailure, CheckResult. Verified with `npx tsc --noEmit` (no errors). Committed (SHA: c55ee9900501aae8ed2ab2bc15a6cab1967cbf63).
- 2026-06-17 — Task 2 complete. Created `data/allowlist.json` (2 PLACEHOLDER zero-address entries for SPCXx + InsightX, intentionally unverified). Created `src/allowlist.ts` (loadAllowlist + isAllowed). TDD: test failed (cannot find module), impl written, all 3 tests pass (case-insensitive match, reject unknown, load from file). Committed (SHA: 96887b6).
