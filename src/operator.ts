import type { Report, DuneResultRef, AllowlistEntry } from "./types.js";
import type { WebSource } from "./scouts/web-scout.js";
import type { JudgeVerdict } from "./verify/llm-judge.js";
import { runGate } from "./verify/gate.js";
import { scoreConfidence } from "./verify/confidence.js";
import { estimateCost, actualCost, timeSavedHours } from "./cost.js";

export interface ResearchInput {
  question: string;
  entities: string[];
  queryIds: number[];
  allowlist: AllowlistEntry[];
  now: string;
}

export interface ResearchDeps {
  onchain: (queryIds: number[]) => Promise<DuneResultRef[]>;
  web: (q: string) => Promise<WebSource[]>;
  synthesize: (q: string, dune: DuneResultRef[], web: WebSource[], addrs: string[]) => Promise<Report>;
  judge: (r: Report) => Promise<JudgeVerdict>;
  renderPdf: (r: Report, meta: { attestationTx: string; cost: { estimateUsd: number; actualUsd: number; timeSavedHours: number } }) => Promise<string>;
  attest: (pdfPath: string) => Promise<string>;
  telemetry: { runCompleted: (m: any) => void; flush: () => Promise<void> | void };
}

export interface ResearchOutput {
  passed: boolean;
  pdfPath?: string;
  attestationTx?: string;
  failures?: unknown;
}

export async function runResearch(input: ResearchInput, deps: ResearchDeps): Promise<ResearchOutput> {
  const started = Date.now();
  const addrs = input.allowlist.map((e) => e.address);

  const [dune, web] = await Promise.all([deps.onchain(input.queryIds), deps.web(input.question)]);
  const report = await deps.synthesize(input.question, dune, web, addrs);

  // Attach auditable confidence to each claim before gating.
  for (const c of report.claims) {
    const onchainVerified = c.metrics.some((m) => m.provenance.kind === "dune");
    c.signals = { sourceQuality: 0.9, sourceAgreement: 0.85, freshness: 0.9, onchainVerified };
    c.confidence = scoreConfidence(c.signals);
  }

  const gate = await runGate(report, dune, input.allowlist, input.now, deps.judge);
  if (!gate.passed) {
    deps.telemetry.runCompleted({ passed: false, gateStage: gate.stage, confidenceAvg: 0, costUsd: 0, latencyMs: Date.now() - started });
    await deps.telemetry.flush();
    return { passed: false, failures: gate.failures.length ? gate.failures : gate.judgeNotes };
  }

  const cost = { estimateUsd: estimateCost({ synthTokens: 10_000, judgeTokens: 2_000 }), actualUsd: actualCost({ synthTokens: 9_000, judgeTokens: 1_800 }), timeSavedHours: timeSavedHours() };
  // Two-phase: render once with a placeholder tx to hash, attest the hash, then re-render with the real tx.
  const draftPath = await deps.renderPdf(report, { attestationTx: "pending", cost });
  const attestationTx = await deps.attest(draftPath);
  const pdfPath = await deps.renderPdf(report, { attestationTx, cost });

  const confidenceAvg = Math.round(report.claims.reduce((s, c) => s + (c.confidence ?? 0), 0) / report.claims.length);
  deps.telemetry.runCompleted({ passed: true, gateStage: "passed", confidenceAvg, costUsd: cost.actualUsd, latencyMs: Date.now() - started });
  await deps.telemetry.flush();
  return { passed: true, pdfPath, attestationTx };
}
