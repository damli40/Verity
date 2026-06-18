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
    maxTokens: 4096,
  });
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json) as Report;
}
