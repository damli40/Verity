# Verity — Handoff / Living Status

> **Update this file after every meaningful action** (step/task done, blocker hit, decision made, open question resolved). A fresh agent must be able to resume from this file alone. Append to the log; don't silently rewrite history.

**Last updated:** 2026-06-17 — by: Task 12 execution (telemetry complete)

---

## TL;DR (read this first)

- **What:** Verity, a verification-first onchain-finance research agent. Mantle Research Challenge, Track 2. Deadline **July 3, 2026**.
- **Where we are:** Tasks 0–12 complete. Telemetry (PostHog) with injectable sink built. Ready for Task 13 (report builder).
- **Next action:** Begin **Task 13** (report builder/PDF) in the plan.
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
| 3 | **Deterministic provenance checker (spine)** | ☑ done |
| 4 | **Confidence scorer** | ☑ done |
| 5 | Dune client | ☑ done |
| 6 | onchain-finance-scout (allowlist) | ☑ done |
| 7 | web-scout (Exa) | ☑ done |
| 8 | Synthesizer (Claude) | ☑ done |
| 9 | LLM-as-judge | ☑ done |
| 10 | Verification gate | ☑ done |
| 11 | Cost transparency | ☑ done |
| 12 | Telemetry (PostHog) | ☑ done |
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
- 2026-06-17 — Task 3 complete. Created `src/verify/provenance-checker.ts` (checkProvenance — the verification spine). Created `src/verify/provenance-checker.test.ts`. TDD: test failed (cannot find module), impl written, 1 failing test diagnosed (freshness boundary: `>` should be `>=` so executedAt exactly 45 days before asOf is treated as stale), fixed, all 7 tests pass. Committed (SHA: 5653429). Next: Task 4 — Confidence scorer.
- 2026-06-17 — Task 4 complete. Created `src/verify/confidence.ts` (scoreConfidence — auditable per-claim 0..100 confidence score). Created `src/verify/confidence.test.ts`. TDD: test failed (cannot find module), impl written (weighted: 30% sourceQuality + 25% sourceAgreement + 20% freshness + 25% onchainVerified), all 3 tests pass (high confidence for perfect signals, lower for weak signals, clamped 0..100). Committed (SHA: f096b99). Next: Task 5 — Dune client.
- 2026-06-17 — Task 5 complete. Created `src/scouts/dune.test.ts` and `src/scouts/dune.ts`. TDD: test failed (cannot find module), impl written (shapeDuneResult pure shaper + getLatestDuneResults fetch), 1 test passes. Committed (SHA: 69de487). Next: Task 6 — onchain-finance-scout.
- 2026-06-17 — Task 6 complete. Created `src/scouts/onchain-finance-scout.test.ts` (2 tests: resolve allowlisted entities + reject unknowns). TDD: test failed (cannot find module), impl written (resolveTargets + runOnchainScout). All 2 tests pass. Committed (SHA: 049a1ce). Next: Task 7 — web-scout.
- 2026-06-17 — Task 7 complete. Created `src/scouts/web-scout.test.ts` and `src/scouts/web-scout.ts`. TDD: test failed (cannot find module), impl written (shapeExaResults pure shaper + runWebScout fetch to Exa API with 6 results, text content, 500-char snippet truncation). 1 test passes. Committed (SHA: e458bdf). Handoff updated. Next: Task 8 — synthesizer.
- 2026-06-17 — Task 8 complete. Created `src/synthesizer.test.ts` and `src/synthesizer.ts`. TDD: test failed (cannot find module), impl written (buildSynthesisPrompt pure prompt-builder + synthesize IO function calling Claude). 2 tests pass (prompt contains question/queryId/URLs/addresses + provenance/queryId instructions). `npx tsc --noEmit` clean. Committed (SHA: 6cccc9c). Next: Task 9 — LLM-as-judge.
- 2026-06-17 — Task 9 complete. Created `src/verify/llm-judge.test.ts` (2 tests: prompt builder + verdict JSON parser). TDD: test failed (cannot find module), impl written (buildJudgePrompt, parseJudgeVerdict, judge async function with configurable VERITY_JUDGE_MODEL env var defaulting to claude-haiku-4-5-20251001). All 2 tests pass. `npx tsc --noEmit` clean. Committed (SHA: ab6b875). Next: Task 10 — verification gate.
- 2026-06-17 — Task 10 complete. Created `src/verify/gate.ts` (runGate — deterministic-first hard gate with injected judgeFn) and `src/verify/gate.test.ts` (3 tests: deterministic short-circuit, full pass, judge rejection). TDD: test failed (cannot find module), impl written, all 3 tests pass. Full suite: 24/24 pass. `npx tsc --noEmit` clean. Committed (SHA: fdec0ee). Next: Task 11 — cost transparency.
- 2026-06-17 — Task 11 complete. Created `src/cost.ts` (TokenUsage interface, estimateCost + actualCost shared pure function at 15µ USD/synth token + 1µ USD/judge token, timeSavedHours returning 4 hours). Created `src/cost.test.ts` (3 tests: positive estimate, positive actual, positive hours-saved). TDD: test failed (module not found), impl written, all 3 tests pass. `npx tsc --noEmit` clean. Committed (SHA: e697151). Next: Task 12 — telemetry (PostHog).
- 2026-06-17 — Task 12 complete. Created `src/telemetry.test.ts` (1 test: captures run event with injected sink). Created `src/telemetry.ts` (RunMetrics interface, Sink interface with capture + shutdown, makeTelemetry factory, defaultSink with PostHog or no-op). TDD: test failed (module not found), impl written, 1 test passes. `npx tsc --noEmit` clean. Committed (SHA: 5b2942a). Next: Task 13 — report builder (PDF).
