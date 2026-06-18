import type { Report } from "../types.js";
import { complete } from "../llm.js";

export interface JudgeVerdict {
  passed: boolean;
  notes: string;
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

export function parseJudgeVerdict(text: string): JudgeVerdict {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json) as JudgeVerdict;
}

export async function judge(report: Report): Promise<JudgeVerdict> {
  const model = process.env.VERITY_JUDGE_MODEL ?? "claude-haiku-4-5-20251001";
  const text = await complete({ model, prompt: buildJudgePrompt(report), maxTokens: 1024 });
  return parseJudgeVerdict(text);
}
