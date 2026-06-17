import type {
  Report,
  DuneResultRef,
  AllowlistEntry,
  CheckResult,
  CheckFailure,
  Metric,
} from "../types.js";
import { isAllowed } from "../allowlist.js";

const REL_TOLERANCE = 0.005;          // 0.5% relative tolerance for numeric equality
const FRESHNESS_WINDOW_DAYS = 45;     // dune data must be no older than this before asOf

function approxEqual(a: number, b: number): boolean {
  if (a === b) return true;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denom <= REL_TOLERANCE;
}

function daysBetween(a: string, b: string): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

function checkMetric(
  claimId: string,
  m: Metric,
  dune: DuneResultRef[],
  allowlist: AllowlistEntry[],
  asOf: string,
): CheckFailure[] {
  const fails: CheckFailure[] = [];

  if (m.address && !isAllowed(m.address, allowlist)) {
    fails.push({ claimId, metricLabel: m.label, reason: `address ${m.address} not on allowlist` });
  }

  if (m.provenance.kind === "dune") {
    const { queryId, column, row } = m.provenance;
    const result = dune.find((d) => d.queryId === queryId);
    if (!result) {
      fails.push({ claimId, metricLabel: m.label, reason: `dune query ${queryId} not found` });
      return fails;
    }
    const cell = result.rows[row]?.[column];
    if (typeof cell !== "number") {
      fails.push({ claimId, metricLabel: m.label, reason: `dune cell ${column}[${row}] is not numeric` });
    } else if (!approxEqual(m.value, cell)) {
      fails.push({
        claimId,
        metricLabel: m.label,
        reason: `value mismatch: claimed ${m.value}, query ${queryId} returned ${cell}`,
      });
    }
    // Freshness: the data backing this metric must be recent enough relative to asOf.
    const ageDays = daysBetween(asOf, result.executedAt);
    if (ageDays >= FRESHNESS_WINDOW_DAYS) {
      fails.push({
        claimId,
        metricLabel: m.label,
        reason: `stale data: query ${queryId} executed ${result.executedAt}, exceeds freshness window`,
      });
    }
  }

  return fails;
}

/**
 * Deterministic verification gate. Returns passed=false with specific failures if any
 * numeric claim cannot be traced to its source value, uses a non-allowlisted address,
 * states an un-sourced figure, or is backed by stale data.
 *
 * `now` is the report build date (ISO), used as the upper bound for freshness reasoning.
 */
export function checkProvenance(
  report: Report,
  dune: DuneResultRef[],
  allowlist: AllowlistEntry[],
  now: string,
): CheckResult {
  const failures: CheckFailure[] = [];
  const hasDigit = /\d/;

  for (const claim of report.claims) {
    // Un-sourced figure: a non-forward-looking claim whose text states a number but carries no metric.
    if (!claim.forwardLooking && claim.metrics.length === 0 && hasDigit.test(claim.text)) {
      failures.push({ claimId: claim.id, reason: `un-sourced figure in claim text with no metric` });
    }
    for (const m of claim.metrics) {
      failures.push(...checkMetric(claim.id, m, dune, allowlist, report.asOf));
    }
  }

  // `now` reserved for future "data dated after report build" checks; referenced to avoid unused param.
  void now;
  return { passed: failures.length === 0, failures };
}
