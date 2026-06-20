import type { ConfidenceSignals, Claim, DuneResultRef, ScrapeResult } from "../types.js";

const FRESHNESS_WINDOW_DAYS = 45;

function daysBetween(a: string, b: string): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

/**
 * Derive a claim's confidence signals from its ACTUAL provenance — never flat constants.
 * Every signal traces to the claim's own metrics and the age of the data backing them, so the
 * score is auditable and recomputable (mirrors the project's verify-don't-trust stance).
 */
export function deriveSignals(
  claim: Claim,
  dune: DuneResultRef[],
  scrapes: ScrapeResult[],
  asOf: string,
): ConfidenceSignals {
  const metrics = claim.metrics;
  const onchainVerified = metrics.some((m) => m.provenance?.kind === "dune");

  // sourceQuality: recomputable Dune cells are strongest; allowlisted scrapes weaker;
  // a metric-less (forward-looking) claim is weakest.
  let sourceQuality: number;
  if (metrics.length === 0) sourceQuality = 0.4;
  else if (metrics.every((m) => m.provenance?.kind === "dune")) sourceQuality = 1;
  else if (onchainVerified) sourceQuality = 0.85;
  else sourceQuality = 0.7;

  // sourceAgreement: distinct backing sources = stronger corroboration.
  const distinct = new Set(
    metrics.map((m) => {
      const p = m.provenance;
      if (!p) return "none";
      return p.kind === "dune" ? `dune:${p.queryId}` : p.url;
    }),
  );
  const sourceAgreement = distinct.size >= 2 ? 0.9 : metrics.length ? 0.6 : 0.3;

  // freshness: linear decay over the window, measured from the OLDEST backing source.
  const ages: number[] = [];
  for (const m of metrics) {
    const p = m.provenance;
    if (!p) continue;
    if (p.kind === "dune") {
      const d = dune.find((r) => r.queryId === p.queryId);
      if (d) ages.push(daysBetween(asOf, d.executedAt));
    } else if (p.kind === "scrape") {
      const s = scrapes.find((x) => x.url === p.url);
      if (s) ages.push(daysBetween(asOf, s.scrapedAt));
    }
  }
  const maxAge = ages.length ? Math.max(...ages) : FRESHNESS_WINDOW_DAYS / 2;
  const freshness = Math.max(0, Math.min(1, 1 - maxAge / FRESHNESS_WINDOW_DAYS));

  return { sourceQuality, sourceAgreement, freshness, onchainVerified };
}

/**
 * Maps concrete signals to a 0..100 confidence score. Weights are explicit and auditable
 * (no model involved): onchain-verified data is the strongest signal, then source quality,
 * agreement, and freshness.
 */
export function scoreConfidence(s: ConfidenceSignals): number {
  const weighted =
    0.30 * s.sourceQuality +
    0.25 * s.sourceAgreement +
    0.20 * s.freshness +
    0.25 * (s.onchainVerified ? 1 : 0);
  return Math.max(0, Math.min(100, Math.round(weighted * 100)));
}
