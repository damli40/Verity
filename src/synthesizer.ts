import type { Report, DuneResultRef } from "./types.js";
import type { WebSource } from "./scouts/web-scout.js";
import { complete } from "./llm.js";

export function buildSynthesisPrompt(
  question: string,
  dune: DuneResultRef[],
  web: WebSource[],
  allowedAddresses: string[],
): string {
  return [
    `You are a research synthesizer. Answer the QUESTION as a JSON Report object.`,
    `QUESTION: ${question}`,
    ``,
    `DUNE DATA (the ONLY source for numbers). Each query's rows are authoritative:`,
    JSON.stringify(dune),
    ``,
    `WEB SOURCES (for qualitative context + citation URLs):`,
    JSON.stringify(web),
    ``,
    `ALLOWED CONTRACT ADDRESSES (use only these for metric.address):`,
    JSON.stringify(allowedAddresses),
    ``,
    `RULES:`,
    `- Output ONLY JSON matching: { question, asOf, claims: Claim[] }.`,
    `- asOf = the most recent Dune executedAt date (YYYY-MM-DD).`,
    `- Every numeric metric MUST carry provenance { kind:"dune", queryId, column, row } pointing`,
    `  at the exact cell, and metric.value MUST equal that cell verbatim. Never compute or round.`,
    `- Every metric MUST include a descriptive "label" string.`,
    `- Speculative/predictive claims must set forwardLooking:true and carry no metrics.`,
    `- Do not state any number you cannot back with a dune cell.`,
    ``,
    `ANALYSIS QUALITY (a reviewer will reject thin reports):`,
    `- The FIRST claim must give a direct, explicit answer to the QUESTION (e.g. "Yes — ..." / "No — ...")`,
    `  with the headline reasoning, backed by metrics.`,
    `- Answer EVERY part of the QUESTION. If it has sub-questions, cover each in its own claim.`,
    `- Each claim's "text" must be a complete, self-contained sentence that names the time period`,
    `  (e.g. "Q2 2026"), interprets the numbers, and states the implication — never bare data.`,
    `- To judge acceleration, compare consecutive periods' growth rates explicitly using the QoQ data.`,
    `- Tie tokenized-equity volume figures directly to the adoption sub-question.`,
    `- Produce 4-6 claims total; mark genuinely forward-looking statements forwardLooking:true.`,
  ].join("\n");
}

/**
 * Coerce raw model JSON into a well-formed Report so downstream code (operator, checker) can
 * trust the shape. Malformed claims/metrics are kept but normalized — bad metric provenance is
 * then caught fail-closed by the deterministic checker, never crashing the pipeline.
 */
export function normalizeReport(raw: unknown): Report {
  const r = (raw ?? {}) as Record<string, unknown>;
  const claims = Array.isArray(r.claims) ? r.claims : [];
  return {
    question: typeof r.question === "string" ? r.question : "",
    asOf: typeof r.asOf === "string" ? r.asOf : "",
    claims: claims.map((c) => {
      const cc = (c ?? {}) as Record<string, unknown>;
      const rawMetrics = Array.isArray(cc.metrics) ? cc.metrics : [];
      return {
        id: String(cc.id ?? ""),
        text: String(cc.text ?? ""),
        forwardLooking: Boolean(cc.forwardLooking),
        metrics: rawMetrics.map((m) => {
          const mm = (m ?? {}) as Record<string, unknown>;
          return {
            label: String(mm.label ?? ""),
            value: typeof mm.value === "number" ? mm.value : Number(mm.value),
            ...(typeof mm.unit === "string" ? { unit: mm.unit } : {}),
            ...(typeof mm.address === "string" ? { address: mm.address } : {}),
            // Pass provenance through as-is; the deterministic checker fails-closed if it's missing/invalid.
            provenance: mm.provenance as Report["claims"][number]["metrics"][number]["provenance"],
          };
        }),
      };
    }),
  };
}

export interface SynthesisResult {
  report: Report;
  /** Tokens billed by the synthesis model, surfaced for real cost reporting. */
  tokens: number;
}

/** Calls the configured synthesis model (Anthropic or OpenAI) and parses the Report JSON. */
export async function synthesize(
  question: string,
  dune: DuneResultRef[],
  web: WebSource[],
  allowedAddresses: string[],
): Promise<SynthesisResult> {
  const model = process.env.VERITY_SYNTH_MODEL ?? "claude-opus-4-8";
  const { text, tokens } = await complete({
    model,
    prompt: buildSynthesisPrompt(question, dune, web, allowedAddresses),
    // 8192 leaves room for reasoning models (o-series / gpt-5) plus the JSON report body.
    maxTokens: 8192,
  });
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("synthesizer returned no parseable JSON (model output was empty or non-JSON)");
  }
  return { report: normalizeReport(JSON.parse(text.slice(start, end + 1))), tokens };
}
