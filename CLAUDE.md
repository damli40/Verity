# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project: Verity

Verity is a **verification-first** onchain-finance research agent (Mantle Research Challenge, Track 2). Design: `docs/superpowers/specs/2026-06-17-verity-onchain-research-agent-design.md`. Plan: `docs/superpowers/plans/2026-06-17-verity-onchain-research-agent.md`. Execute the plan task-by-task; do not freelance ahead of it.

## 5. The Cardinal Rule — Never Trust the LLM on Numbers

The whole project exists because LLM research can't be trusted. So:
- **The deterministic provenance checker (`src/verify/provenance-checker.ts`) is the spine.** Every numeric claim must equal its source cell, programmatically — never via the model. Build and protect it first.
- The LLM-as-judge checks **qualitative** quality only (coverage, reasoning, contradiction). It must never be the thing that validates a number.
- **Trust comes from re-runnable Dune query IDs + the recomputable PDF hash.** The ERC-8004 attestation is a timestamp/anchor, not the trust source. Never write or imply otherwise in code, comments, or docs.
- **Never invent a contract address.** Addresses come only from the hand-verified allowlist. Off-list ⇒ rejected. Confirm real addresses on the Mantle explorer and record provenance.

## 6. Discipline From the Plan

- **TDD:** failing test → run it fail → minimal impl → run it pass → commit. One behavior per test.
- **Commit after every task** using the message in that task's final step.
- **External I/O is injected** (deps passed in) so logic stays unit-testable without network. Keep it that way.
- **No real mainnet transaction** until Task 14 Step 1 confirms the live Mantle registry address/ABI on-explorer. The `--fixture` path must never hit Dune or Mantle.
- TypeScript, ESM, `tsx` to run, `vitest` to test. Match the established file boundaries — one responsibility per file.

## 7. Handoff Protocol (MANDATORY)

`handoff.md` is the living status of this build. **Update it after every meaningful action** (completing a step/task, hitting a blocker, making a decision, resolving an open question). Keep it truthful — if a test fails or a step is skipped, say so. A new agent with zero context must be able to read `handoff.md` and resume immediately. Append progress; never overwrite history silently.
