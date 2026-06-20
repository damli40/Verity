import type { Report } from "../types.js";
import { complete } from "../llm.js";

export interface JudgeVerdict {
  passed: boolean;
  notes: string;
  /** Tokens billed by the judge model, surfaced for real cost reporting. */
  tokens?: number;
}

export function buildJudgePrompt(report: Report): string {
  return [
    `You are a QUALITATIVE research reviewer. Numbers are verified elsewhere — do NOT check arithmetic.`,
    `Assess only: coverage (does it answer the question), reasoning quality, and internal contradiction.`,
    `Return ONLY JSON: { "passed": boolean, "notes": string }.`,
    `REPORT:`,
    JSON.stringify(report),
  ].join("\n");
}

/** Fail-closed: an empty or unparseable judge response is treated as NOT passed, never a crash. */
export function parseJudgeVerdict(text: string): JudgeVerdict {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return { passed: false, notes: "unparseable judge response (no JSON found)" };
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as JudgeVerdict;
  } catch {
    return { passed: false, notes: "unparseable judge response (invalid JSON)" };
  }
}

export async function judge(report: Report): Promise<JudgeVerdict> {
  const model = process.env.VERITY_JUDGE_MODEL ?? "claude-haiku-4-5-20251001";
  // 4096 leaves room for reasoning models (o-series / gpt-5) that spend tokens before emitting content.
  const { text, tokens } = await complete({ model, prompt: buildJudgePrompt(report), maxTokens: 4096 });
  return { ...parseJudgeVerdict(text), tokens };
}
