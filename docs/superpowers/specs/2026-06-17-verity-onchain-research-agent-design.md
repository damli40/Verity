# Verity — A Verification Engine for Onchain-Finance Research

> **Verity is a research agent that refuses to publish until every important claim can be traced, verified, scored, and attested onchain.**

**Date:** 2026-06-17 · **Author:** Dami
**Context:** Submission for the Mantle Research Challenge (Track 2: The Research Agent), June 16 – July 3, 2026.
**Status:** Design — revised after review, pending final spec sign-off.

---

## 1. Thesis & Positioning

The field is flooded with "AI research agent" submissions competing on autonomy and speed. Verity competes on the thing that actually matters in onchain finance: **trust**. The wedge is *verifiable, not faster*.

The project is three layers, in this order of importance:

1. **Verification Engine (the innovation).** A deterministic provenance checker that proves every numeric claim traces to a re-runnable data source and that every figure equals its source value. This is the spine; everything else supports it.
2. **Research Agent.** The operator + scouts that gather and synthesize the research the engine then verifies.
3. **Attestation Layer (supporting infra).** An ERC-8004 anchor on Mantle that timestamps the verified report.

**Where the trust actually comes from — stated plainly so it survives a sharp reader:** verifiability lives in the **public Dune query IDs anyone can re-run** plus the **recomputable PDF hash**. The on-chain attestation is a **timestamp/anchor**, not the source of trust. A self-issued attestation proves "this agent committed to this exact report at this time," not "this report is true." The truth claim is carried by the re-runnable queries and the deterministic checks — the ERC-8004 branding does not paper over that.

This is coherent with Dami's independent-analyst brand (the ZachXBT model: analysis is worth only as much as it is independently checkable).

## 2. Goals & Non-Goals

**Goals (v1, shippable in the window):**
- Clone-and-run public repo demonstrating the pipeline end to end.
- One live example built around a **claim that must be proven** (see §9), producing a verified PDF report.
- A **deterministic provenance checker** that can reject an output — demonstrated rejecting a planted bad claim.
- Per-claim **confidence scores** grounded in concrete signals.
- One real **ERC-8004 attestation on Mantle mainnet** via the Validation Registry.
- Evals + PostHog instrumentation live from day one.
- Packaged as a Mantle Agent Skill (`SKILL.md`) for the named bonus.

**Non-Goals (v1 — roadmap):**
- Dynamic LLM-based address resolution (v1 uses a hand-verified allowlist).
- Per-run / autonomous attestation, `/loop`+`/goal`, multi-model worker fan-out.
- Real x402 pay-to-run flow (v1 shows estimated vs actual compute cost only).
- Any private vault internals.

## 3. Architecture

Six real units. The main thread (operator) never sees raw API data, ABI bytes, or log dumps — only summaries and paths.

```
        User question / claim
                  │
                  ▼
        Operator (plan + cost estimate)
                  │
                  ▼
        Scouts  ── onchain-finance-scout (allowlist → Dune)
                └─ web-scout (Exa / Firecrawl)
                  │   (summaries + query IDs + sources)
                  ▼
        Synthesizer  → draft claims, each with provenance + confidence
                  │
                  ▼
   ┌────── Verification Gate (HARD) ──────┐
   │  (a) Deterministic provenance checker │  ← the spine
   │  (b) Configurable LLM-as-judge (qual.)│
   └───────────────┬───────────────────────┘
            pass    │    fail → back to synth/scout
                    ▼
        Report builder → PDF (charts, sources, confidence table, cost panel)
                  │
                  ▼
        Attestation → recompute hash → ERC-8004 Validation Registry (Mantle mainnet)
```

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| **Operator** | Plans the run; produces the upfront compute-cost estimate; routes between units. Stays lean. | all below |
| **Scouts** | `onchain-finance-scout` (allowlist-resolved → Dune) and `web-scout` (Exa/Firecrawl). Return summaries + query IDs + source URLs only. | Dune, Exa/Firecrawl MCP |
| **Synthesizer** | Drafts the piece as discrete **claims**, each tagged with its provenance (query ID / source) and a confidence score. | operator |
| **Verification gate** | (a) deterministic provenance checker — programmatic; (b) configurable LLM-as-judge — qualitative only. Hard gate. | PostHog |
| **Report builder** | Verified claims → HTML (Chart.js) → Playwright → PDF. | Playwright/Chromium |
| **Attestation** | Recompute PDF hash; write one Validation-Registry attestation on Mantle mainnet under Verity's ERC-8004 identity. | Mantle RPC, viem/ethers |

*(The earlier "estimator" and "Exa context" units are demoted to functions: cost estimation lives in the operator; any pre-fan-out search is a plain operator step, not a standalone unit.)*

## 4. The Resolve-First Onchain Scout (allowlist in v1)

Querying the wrong address is the single biggest correctness failure mode — **and LLM-based resolution off web search is itself a hallucination vector** (it can grab a lookalike/scam address with full confidence). So v1 resolves against a **hardcoded, hand-verified allowlist** of the known contracts (SPCXx, xStocks venues, InsightX, Mantle RWA contracts), each entry carrying its provenance (where the address was confirmed). This allowlist *is* the verified set the deterministic checker validates against. Dynamic resolution is a roadmap item.

Scout loop:
1. Resolve entities → addresses **via the allowlist** (reject anything not on it).
2. `searchDuneQueries` for existing queries on those addresses; reuse if good.
3. Else write a query scoped to the allowlisted addresses (`createDuneQuery`/`createAndExecuteQuery`).
4. Execute; return a 3–5 line summary + **the Dune query ID(s)** + source URLs. Raw rows never reach the main thread.

Every metric returned carries: value, the allowlisted address it came from, and the Dune query ID.

## 5. The Verification Gate (the differentiator)

A draft does **not** become a PDF or get attested until the gate passes. The gate is deliberately split so the crown-jewel checks are auditable code, not model vibes:

**(a) Deterministic provenance checker — programmatic, the spine. Build this first.**
- Every numeric claim carries a Dune query ID → the asserted value **equals** that query's output (within tolerance). No match → fail.
- Every contract address used is on the **verified allowlist** with recorded provenance. Off-list → fail.
- Freshness: data reflects the stated as-of date.
- No un-sourced figures anywhere in the report.

**(b) Configurable LLM-as-judge — qualitative only.**
- Coverage, reasoning quality, internal contradiction. Model is configurable (env var), **not** anchored to a specific provider — judges care that the system can reject bad output, not which model does it.

**Gate behavior (hard):** any failing deterministic check blocks publish + attestation and returns the run to synthesis/re-scout with the specific failures. Nothing un-verified is ever attested. The demo will show the checker **rejecting a planted bad claim** — proving the gate is real.

**Confidence scores.** Each major claim gets a score (e.g. `RWA TVL +27% → 98%`, `InsightX may drive adoption → 61%`) derived from concrete signals: source quality, source agreement, freshness, and on-chain verification status. Surfaced as a confidence column in the report so the output reads like institutional research.

**PostHog (day one):** per-run check pass/fail, confidence distribution, latency per unit, token/cost.

## 6. Cost Transparency (simplified)

The operator estimates the run's compute cost upfront; PostHog meters the actual spend. The report shows three honest, objective numbers — no margin, no mock invoice:
- **Estimated compute cost**
- **Actual compute cost**
- **Time saved vs manual research** (turnaround vs an analyst doing the same pulls by hand)

This keeps the agent held to its own estimate (on-theme with verification) without the gimmick. A real x402 pay-to-run flow is roadmap.

## 7. Output: Verified PDF Report

- **Toolchain:** HTML template + Chart.js → Playwright/Chromium headless → PDF (same pattern as `~/Desktop/career-ops/generate-pdf.mjs`).
- **Contents:** the research piece structured as verified claims; charts rendered from Dune results; a **confidence column**; a **sources section** listing every Dune query ID (re-runnable), each allowlisted address with provenance, and cited URLs; the **cost panel** (§6); and a footer with Verity's ERC-8004 identity + the attestation tx link.

## 8. Attestation (ERC-8004, Mantle mainnet)

Mantle deployed ERC-8004 (Identity / Reputation / Validation registries) on **Feb 16, 2026** — so Verity **registers an identity and uses the existing Validation Registry as designed**; it does not deploy its own contracts. After the gate passes, recompute the final PDF hash and write **one** Validation-Registry attestation on mainnet (gas is cheap). The tx link goes in the report and the submission. Per §1, this anchors/timestamps the verified report; it is not the trust source.

## 9. Live Example (a claim that must be proven)

Instead of a soft survey question, the demo answers a claim that forces the engine to prove something with onchain data:

> **"Did Mantle's RWA growth actually accelerate in Q2 2026 — and are tokenized-equity adoption claims supported onchain?"**

The run resolves the allowlisted contracts, pulls the RWA TVL trajectory (the $247.5M / +27% figure and its path) and tokenized-equity (SPCXx/xStocks) volume via re-runnable Dune queries, scores each claim's confidence, passes the hard gate (with a planted-bad-claim rejection shown), renders the PDF, and attests it on Mantle mainnet. InsightX appears as a lower-confidence forward-looking claim — explicitly marked as such. This single artifact is the demo, the repo sample, and the basis for the X thread.

**Demo robustness:** a **cached canonical run** (fixtures of the scout outputs + Dune results) guarantees the PDF always renders for judges, while live-run capability is retained. No judge hits a dead Dune query at 11pm.

## 10. Public Repo Structure (clone-and-run)

```
verity/
  README.md              # one-sentence thesis, what/why/how, the live example + tx link
  SKILL.md               # Mantle Agent Skill packaging (bonus)
  src/
    operator.*           # orchestrator + cost estimate
    scouts/
      onchain-finance-scout.*   # allowlist-resolve → Dune
      web-scout.*               # Exa/Firecrawl
    synthesizer.*               # claims + provenance + confidence
    verify/
      provenance-checker.*      # DETERMINISTIC — build first
      llm-judge.*               # qualitative, configurable model
    report/
      template.html             # + Chart.js
      generate-pdf.mjs          # Playwright → PDF
    attest-8004/                # identity + Validation Registry (Mantle mainnet)
  data/
    allowlist.json              # hand-verified addresses + provenance
  evals/                        # rubric + fixtures (incl. planted-bad-claim case)
  fixtures/                     # cached canonical run for robust demo
  examples/
    mantle-rwa-q2-2026.pdf      # the live, attested sample output
  posthog/                      # event schema / setup notes
  .env.example
```

## 11. Build Order (de-risked)

1. **Deterministic provenance checker** + its eval fixtures (incl. planted bad claim). The spine; everything's meaning depends on it.
2. Allowlist + onchain-finance-scout (Dune) returning query IDs.
3. Synthesizer emitting claims with provenance + confidence.
4. Verification gate wiring (checker + LLM judge) + PostHog.
5. Report builder (PDF, charts, confidence, sources, cost panel) + cached fixture run.
6. ERC-8004 identity + one mainnet Validation-Registry attestation.
7. SKILL.md packaging, README, X thread, submission.

## 12. Submission Checklist

- [ ] Public repo live (clone-and-run) + cached fixture demo
- [ ] Attested PDF report + Mantle mainnet tx link + re-runnable Dune query IDs
- [ ] Deterministic gate demonstrably rejecting a bad claim
- [ ] PostHog evals instrumented (optional public dashboard)
- [ ] X post/thread tagging @Mantle_Official, following + like/share the article
- [ ] Joined Mantle creators Discord
- [ ] Participation form submitted with correct wallet address

## 13. What's Next (roadmap)

- Dynamic, verified address resolution (beyond the allowlist).
- Per-run + autonomous attestation; reputation accrual via the ERC-8004 Reputation Registry.
- `/loop`+`/goal` autonomy; cheap multi-model worker fan-out (the full "new meta").
- Real **x402** pay-to-run, turning §6's estimate into an actual paid flow.

## 14. Open Questions / Risks

- **Repo language:** TypeScript vs Python for the skeleton (TS pairs naturally with viem + Playwright; Python pairs with your existing scout scripts). To settle in the implementation plan.
- **Validation Registry interface:** confirm the exact Mantle contract address + ABI and the intended `validationRequest`/attestation call shape before wiring §8.
- **Scope discipline:** the deterministic checker is the project. Resist letting roadmap items (dynamic resolution, multi-model, x402) leak into v1.
