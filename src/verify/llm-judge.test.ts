import { describe, it, expect } from "vitest";
import { buildJudgePrompt, parseJudgeVerdict } from "./llm-judge.js";

describe("llm-judge", () => {
  it("builds a prompt asking for coverage/reasoning/contradiction only", () => {
    const p = buildJudgePrompt({ question: "q", asOf: "2026-06-16", claims: [] });
    expect(p.toLowerCase()).toContain("coverage");
    expect(p.toLowerCase()).toContain("contradiction");
  });

  it("parses a verdict JSON", () => {
    const v = parseJudgeVerdict('{"passed":true,"notes":"ok"}');
    expect(v.passed).toBe(true);
    expect(v.notes).toBe("ok");
  });

  it("fails closed on an empty response (no crash)", () => {
    const v = parseJudgeVerdict("");
    expect(v.passed).toBe(false);
    expect(v.notes).toMatch(/unparseable/i);
  });

  it("fails closed on malformed JSON", () => {
    const v = parseJudgeVerdict("{not valid json");
    expect(v.passed).toBe(false);
    expect(v.notes).toMatch(/unparseable/i);
  });
});
