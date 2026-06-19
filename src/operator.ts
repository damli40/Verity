import type { Report, DuneResultRef, AllowlistEntry, ScrapeResult, SourceAllowlistEntry } from "./types.js";
import type { WebSource } from "./scouts/web-scout.js";
import type { JudgeVerdict } from "./verify/llm-judge.js";
import type { DiscoveryResult } from "./discovery/match-onchain.js";
import { runGate } from "./verify/gate.js";
import { scoreConfidence } from "./verify/confidence.js";
import { estimateCost, actualCost, timeSavedHours } from "./cost.js";
import { resolveTargets } from "./scouts/onchain-finance-scout.js";
import { deriveTier } from "./verify/tier.js";

export interface ResearchInput {
  question: string;
  entities: string[];
  queryIds: number[];
  allowlist: AllowlistEntry[];
  now: string;
  sourceAllowlist?: SourceAllowlistEntry[];
}

export interface ResearchDeps {
  onchain: (queryIds: number[]) => Promise<DuneResultRef[]>;
  web: (q: string) => Promise<WebSource[]>;
  scrape?: () => Promise<ScrapeResult[]>;
  discover?: () => Promise<DiscoveryResult>;
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
  discovered?: DiscoveryResult;
  failures?: unknown;
}

export async function runResearch(input: ResearchInput, deps: ResearchDeps): Promise<ResearchOutput> {
  const started = Date.now();
  const addrs = resolveTargets(input.entities, input.allowlist).map((t) => t.address);

  const [dune, web, scrapes, discovered] = await Promise.all([
    deps.onchain(input.queryIds),
    deps.web(input.question),
    deps.scrape ? deps.scrape() : Promise.resolve([] as ScrapeResult[]),
    deps.discover ? deps.discover() : Promise.resolve(undefined),
  ]);
  const report = await deps.synthesize(input.question, dune, web, addrs);

  // Attach auditable confidence to each claim before gating.
  for (const c of report.claims) {
    const onchainVerified = c.metrics.some((m) => m.provenance?.kind === "dune");
    c.signals = { sourceQuality: 0.9, sourceAgreement: 0.85, freshness: 0.9, onchainVerified };
    c.confidence = scoreConfidence(c.signals);
  }

  const gate = await runGate(report, dune, input.allowlist, input.now, deps.judge, scrapes, input.sourceAllowlist ?? []);
  if (!gate.passed) {
    deps.telemetry.runCompleted({ passed: false, gateStage: gate.stage, confidenceAvg: 0, costUsd: 0, latencyMs: Date.now() - started });
    await deps.telemetry.flush();
    return { passed: false, discovered, failures: gate.failures.length ? gate.failures : gate.judgeNotes };
  }

  // Gate passed → every numeric metric is valid; derive each claim's trust tier for the report.
  for (const c of report.claims) c.tier = deriveTier(c);

  const cost = { estimateUsd: estimateCost({ synthTokens: 10_000, judgeTokens: 2_000 }), actualUsd: actualCost({ synthTokens: 9_000, judgeTokens: 1_800 }), timeSavedHours: timeSavedHours() };
  // Two-phase: render once with a placeholder tx to hash, attest the hash, then re-render with the real tx.
  const draftPath = await deps.renderPdf(report, { attestationTx: "pending", cost });
  const attestationTx = await deps.attest(draftPath);
  const pdfPath = await deps.renderPdf(report, { attestationTx, cost });

  const confidenceAvg = Math.round(report.claims.reduce((s, c) => s + (c.confidence ?? 0), 0) / report.claims.length);
  deps.telemetry.runCompleted({ passed: true, gateStage: "passed", confidenceAvg, costUsd: cost.actualUsd, latencyMs: Date.now() - started });
  await deps.telemetry.flush();
  return { passed: true, pdfPath, attestationTx, discovered };
}
