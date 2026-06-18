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
    `- Speculative/predictive claims must set forwardLooking:true and carry no metrics.`,
    `- Do not state any number you cannot back with a dune cell.`,
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
      return {
        id: String(cc.id ?? ""),
        text: String(cc.text ?? ""),
        forwardLooking: Boolean(cc.forwardLooking),
        metrics: Array.isArray(cc.metrics) ? (cc.metrics as Report["claims"][number]["metrics"]) : [],
      };
    }),
  };
}

/** Calls the configured synthesis model (Anthropic or OpenAI) and parses the Report JSON. */
export async function synthesize(
  question: string,
  dune: DuneResultRef[],
  web: WebSource[],
  allowedAddresses: string[],
): Promise<Report> {
  const model = process.env.VERITY_SYNTH_MODEL ?? "claude-opus-4-8";
  const text = await complete({
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
  return normalizeReport(JSON.parse(text.slice(start, end + 1)));
}
