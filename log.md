# Verity — Work Log

Running log of meaningful work, newest first. Detail lives in `handoff.md`; this is the at-a-glance trail.

## 2026-06-21
- **CoinGecko folded into discovery (spec source 0).** Verified Demo key: RWA category + `platforms.mantle`
  works; RWA∩Mantle filter returns 10 coins with clean distinct addresses (USDY + xStocks suite) — better
  than the rwa.xyz scrape. Primary discovery candidate source; follow-up = wire a `coingeckoRwaCandidates`
  adapter (`COINGECKO_API_KEY`) before the flagship run. Doesn't bypass issuer-official ∩ on-chain (Cardinal
  Rule); category noise (e.g. bridged LINK) quarantines by design.
- **Ormi 0xGraph folded into Plan 2 spec.** Verified: Ormi REST 0xAPI not on Mantle yet ("Coming soon");
  0xGraph subgraphs ARE on Mantle (`subgraph.mantle.xyz`). Plan: Ormi = preferred 2nd on-chain source
  (reproducible GraphQL, pipeline-callable), per-token no-code ERC-20 subgraph; Etherscan → last-resort
  confirm. Spec rows + ProvenanceRef + scouts/checker/cross-check/decomposition updated. **Next session:
  write + execute Plan 2.**
- **v3 Plan 1 (Discovery Funnel) built, reviewed, and LIVE-VERIFIED** on branch `verity-v3-plan1-discovery`
  (subagent-driven, 7 TDD tasks, 106/106 tests, tsc clean, `--fixture` green). Replaces the stubbed
  discovery with: candidate metadata (`claimedAddress`/`sourceUrl`) + `issuer-official` source role →
  strict issuer-address matcher → async issuer-official+on-chain resolver → auto-promoting `matchOnchain`
  → live Firecrawl (candidates) + Etherscan/Mantlescan (`eth_getCode`) wiring.
  - Commits: 986b7f2 (T1), 199f9aa (T2), 23dbf1e (T3), e0d32b0 (T4), 3cbc080 (T5), 85dbb04 (T6 handoff), 3a73cba (T7).
  - **Task 7** added after a pre-merge live test exposed that raw `fetch()` can't read JS-rendered issuer
    docs: now uses a Firecrawl scrape against the issuer's `/addresses` page.
  - **Live proof:** discovered MI4/Securitize + xStocks beyond USDY/mUSD; auto-verified USDY+mUSD
    (Ondo `/addresses` ∩ on-chain), quarantined MI4 + xStocks. Cardinal Rule upheld.
- Spec + Plan 1 written/committed (53539b1, 34d69b3 spec; 9fa1748 plan). Nansen MCP re-keyed; Etherscan
  added as the Nansen-coverage fallback (spec decision 6).

## 2026-06-20
- v3 brainstormed → spec approved (Both deliverables; agreement-tiered Dune+Nansen verify; baked Dune
  charts; broadened report scope; auto-verify on issuer-source ∩ on-chain).
- v2 post-review fixes + fresh live run + re-attestation (tx `0x3b33774f…`, block 96916516); published PDF
  keccak256 == on-chain requestHash, verified.

## Earlier
- v1 built (17-task TDD), live run + real ERC-8004 attestation on Mantle mainnet; v2 Mantle-RWA specialist
  (Plans 1–3). See `handoff.md` progress log for the full history.
