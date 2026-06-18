# Verity — Handoff / Living Status

> **Update this file after every meaningful action** (step/task done, blocker hit, decision made, open question resolved). A fresh agent must be able to resume from this file alone. Append to the log; don't silently rewrite history.

**Last updated:** 2026-06-18 — by: post-review surgical fixes (entity resolution wiring + chart.js vendoring)

---

## TL;DR (read this first)

- **What:** Verity, a verification-first onchain-finance research agent. Mantle Research Challenge, Track 2. Deadline **July 3, 2026**.
- **Where we are:** All 17 tasks complete. Documentation packaged (SKILL.md, README.md, posthog/events.md). Ready for final submission.
- **Next action:** All 17 tasks complete — final review + submission (external: push repo public, X thread, Discord, form).
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
| 13 | Report builder (PDF) | ☑ done |
| 14 | ERC-8004 attestation | ☑ done |
| 15 | Operator orchestrator | ☑ done |
| 16 | CLI + cached fixture run | ☑ done |
| 17 | SKILL.md + README + submission | ☑ done |

Legend: ☐ not started · ◐ in progress · ☑ done

## Open questions / decisions pending

- [ ] **Repo language** — locked to **TypeScript** (Node/ESM, tsx, vitest). Revisit only if blocked.
- [ ] **Mantle ERC-8004 Validation Registry address** — IdentityRegistry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) and ReputationRegistry (`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`) are confirmed from the official erc-8004-contracts README for Mantle Mainnet. The **ValidationRegistry address is NOT listed** in the README for any chain. Must be located and verified on `mantlescan.xyz` before any mainnet tx. Set as `ERC8004_VALIDATION_REGISTRY` in `.env` once confirmed. ABI is confirmed from `abis/ValidationRegistry.json` in the same repo — real signature is `validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)` (differs from original spec placeholder).
- [ ] **Fixture synthesis without `ANTHROPIC_API_KEY`** — decide in Task 16 whether to check in a `fixtures/report.json` so the offline demo runs with zero API keys.

## Decisions log (newest first)

- 2026-06-17 — Attestation target: **Mantle mainnet via the existing Validation Registry** (reversed earlier testnet-only call; Mantle deployed ERC-8004 on 2026-02-16, gas is cheap, more credible).
- 2026-06-17 — Cost feature **simplified** to estimated/actual compute + time-saved (dropped +50% margin & mock invoice).
- 2026-06-17 — v1 uses a **hand-verified address allowlist**; dynamic resolution is roadmap (avoids the resolution-hallucination hole).
- 2026-06-17 — Verification gate split: **deterministic checker (hard, programmatic)** + **configurable LLM judge (qualitative only)**.
- 2026-06-17 — Live example reframed to a **claim that must be proven**: "Did Mantle's RWA growth actually accelerate in Q2 2026, and are tokenized-equity adoption claims supported onchain?"
- 2026-06-17 — Added **cached fixture run** so the demo always renders offline.

## Known minor follow-ups (accepted, non-blocking)

- `evals/` directory is empty — eval harness is roadmap, not blocking submission.
- `now` parameter in `runResearch` is typed as `string` with a documented `void` note in the plan; left as-is per surgical-change rule.
- `ERC8004_IDENTITY_REGISTRY` is used only in the live `attest.ts` setup path; fixture path never reaches it.

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
- 2026-06-17 — Task 14 complete. Created `src/attest-8004/hash.ts` (hashFile — keccak256 of file bytes via viem), `src/attest-8004/hash.test.ts` (1 test, TDD pass), `src/attest-8004/abi.ts` (real ValidationRegistry ABI from erc-8004-contracts repo — `validationRequest(address,uint256,string,bytes32)`, differs from spec placeholder), `src/attest-8004/attest.ts` (attest() IO function, Mantle mainnet via viem walletClient). ABI updated to match real deployed interface. ValidationRegistry Mantle address NOT in README — must confirm on mantlescan.xyz before live tx (see Open questions). `viem` exports `mantle` from `viem/chains` (confirmed v2.52.2). tsc clean, 30/30 tests pass. Committed (SHA: 681b090).
- 2026-06-17 — Task 13 complete. Created `src/report/render-html.test.ts` (1 test: question/claim/confidence/dune-query-id/attestation-tx/chart.js all present). Created `src/report/render-html.ts` (renderReportHtml — pure HTML string builder with Chart.js bar chart, claim table, re-runnable source links, cost + attestation sections). Created `src/report/generate-pdf.ts` (htmlToPdf — headless Chromium via Playwright, networkidle wait + 600ms chart paint delay). TDD: test failed (module not found), impl written, 1 test passes. Playwright smoke test: wrote 52,272-byte PDF successfully. Scratch file + PDF deleted. `npx tsc --noEmit` clean. Committed (SHA: 480d912). Next: Task 14 — ERC-8004 attestation.
- 2026-06-17 — Task 15 complete. Created `src/operator.test.ts` (2 tests: gate-pass → pdf+attest called; gate-fail → renderPdf+attest NOT called). Created `src/operator.ts` (runResearch — wires onchain+web scouts → synthesize → confidence scoring → runGate → conditional renderPdf+attest → telemetry). TDD: test failed (module not found), impl written, 2/2 tests pass. Full suite: 32/32 pass. `npx tsc --noEmit` clean. Committed (SHA: f55ed12). Next: Task 16 — CLI + cached fixture run.
- 2026-06-17 — Task 16 complete. Created `src/cli.ts` (live + fixture branches), `data/allowlist.fixture.json` (2 demo addresses), `fixtures/mantle-rwa-q2-2026.json` (cached scout outputs), `fixtures/report.json` (pre-synthesized report). Appended `VERITY_VALIDATOR_ADDRESS=` to `.env.example`. Added `!examples/mantle-rwa-q2-2026.pdf` gitignore exception. Fixture run (`npx tsx src/cli.ts --fixture`): `"passed": true`, PDF 84,858 bytes, `attestationTx: "simulated-0x1ebb56f76f20"`. `npx tsc --noEmit` clean. Full suite: 32/32 pass. Committed (SHA: b770d79). Next: Task 17 — SKILL.md + README + submission.
- 2026-06-18 — Task 17 complete. Verified all three documentation files exist with correct content: SKILL.md (frontmatter + overview), posthog/events.md (PostHog event schema), README.md (full pipeline with triple-backtick fences, no placeholder text). Updated handoff.md TL;DR + progress log. All files ready for submission. Committed (SHA: df80311).
- 2026-06-18 — Post-review fixes complete (SHA: c3441e3). Fix A: wired `resolveTargets` into `src/operator.ts` so only entity-resolved allowlisted addresses are passed to the synthesizer (full allowlist still goes to provenance checker/gate). Added 3rd operator test proving the wiring. Fix B: vendored chart.js UMD bundle (`chart.umd.js`) inline into `src/report/render-html.ts` via `readFileSync` — CDN dependency eliminated, offline render confirmed. chart.js path resolved via filesystem join from `import.meta.url` (package `exports` field blocks deep `require.resolve`). Fixture demo: `"passed": true`, PDF 69,275 bytes. 33/33 tests pass, `npx tsc --noEmit` clean. Accepted follow-ups noted above.
