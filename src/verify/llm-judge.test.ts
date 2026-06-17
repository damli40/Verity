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
});
