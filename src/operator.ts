import type { Report, DuneResultRef, AllowlistEntry, ScrapeResult, SourceAllowlistEntry } from "./types.js";
import type { WebSource } from "./scouts/web-scout.js";
import type { JudgeVerdict } from "./verify/llm-judge.js";
import type { SynthesisResult } from "./synthesizer.js";
import type { DiscoveryResult } from "./discovery/match-onchain.js";
import { runGate } from "./verify/gate.js";
import { scoreConfidence, deriveSignals } from "./verify/confidence.js";
import { estimateCost, actualCost, timeSavedHours } from "./cost.js";
import { resolveTargets } from "./scouts/onchain-finance-scout.js";
import { deriveTier } from "./verify/tier.js";

/** On-chain anchor identifiers shown in the report's verification footer (known before rendering). */
export interface Anchor {
  agentId: string;
  registry: string;
  chain: string;
}

export interface ResearchInput {
  question: string;
  entities: string[];
  queryIds: number[];
  allowlist: AllowlistEntry[];
  now: string;
  sourceAllowlist?: SourceAllowlistEntry[];
  anchor?: Anchor;
}

export interface ResearchDeps {
  onchain: (queryIds: number[]) => Promise<DuneResultRef[]>;
  web: (q: string) => Promise<WebSource[]>;
  scrape?: () => Promise<ScrapeResult[]>;
  discover?: () => Promise<DiscoveryResult>;
  synthesize: (q: string, dune: DuneResultRef[], web: WebSource[], addrs: string[]) => Promise<SynthesisResult>;
  judge: (r: Report) => Promise<JudgeVerdict>;
  renderPdf: (r: Report, meta: { cost: { estimateUsd: number; actualUsd: number; timeSavedHours: number }; anchor?: Anchor }) => Promise<string>;
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
  const { report, tokens: synthTokens } = await deps.synthesize(input.question, dune, web, addrs);

  // Attach auditable confidence to each claim before gating — signals derived from real provenance.
  for (const c of report.claims) {
    c.signals = deriveSignals(c, dune, scrapes, report.asOf);
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

  const cost = {
    estimateUsd: estimateCost({ synthTokens: 10_000, judgeTokens: 2_000 }), // upfront plan estimate
    actualUsd: actualCost({ synthTokens, judgeTokens: gate.judgeTokens ?? 0 }), // measured from real token usage
    timeSavedHours: timeSavedHours(),
  };
  // Render ONCE, then hash+attest that exact file. The attestation tx is NOT embedded in the PDF, so the
  // published bytes are byte-identical to the attested ones — keccak256(published) == on-chain requestHash.
  const pdfPath = await deps.renderPdf(report, { cost, anchor: input.anchor });
  const attestationTx = await deps.attest(pdfPath);

  const confidenceAvg = Math.round(report.claims.reduce((s, c) => s + (c.confidence ?? 0), 0) / report.claims.length);
  deps.telemetry.runCompleted({ passed: true, gateStage: "passed", confidenceAvg, costUsd: cost.actualUsd, latencyMs: Date.now() - started });
  await deps.telemetry.flush();
  return { passed: true, pdfPath, attestationTx, discovered };
}
