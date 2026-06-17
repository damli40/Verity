import type { Report, DuneResultRef, AllowlistEntry, CheckFailure } from "../types.js";
import { checkProvenance } from "./provenance-checker.js";
import type { JudgeVerdict } from "./llm-judge.js";

export interface GateResult {
  passed: boolean;
  stage: "deterministic" | "qualitative" | "passed";
  failures: CheckFailure[];
  judgeNotes?: string;
}

/**
 * Hard gate. Deterministic provenance checks run first and short-circuit on failure
 * (the judge is never asked to bless un-verifiable numbers). Only if they pass does the
 * qualitative judge run. `judgeFn` is injected for testability.
 */
export async function runGate(
  report: Report,
  dune: DuneResultRef[],
  allowlist: AllowlistEntry[],
  now: string,
  judgeFn: (r: Report) => Promise<JudgeVerdict>,
): Promise<GateResult> {
  const det = checkProvenance(report, dune, allowlist, now);
  if (!det.passed) return { passed: false, stage: "deterministic", failures: det.failures };

  const verdict = await judgeFn(report);
  if (!verdict.passed) {
    return { passed: false, stage: "qualitative", failures: [], judgeNotes: verdict.notes };
  }
  return { passed: true, stage: "passed", failures: [], judgeNotes: verdict.notes };
}
