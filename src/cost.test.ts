import { describe, it, expect } from "vitest";
import { estimateCost, actualCost, timeSavedHours } from "./cost.js";

describe("cost", () => {
  it("estimates compute cost from planned token counts and per-token rates", () => {
    const est = estimateCost({ synthTokens: 10_000, judgeTokens: 2_000 });
    expect(est).toBeGreaterThan(0);
  });

  it("computes actual cost from observed token usage", () => {
    const act = actualCost({ synthTokens: 8_000, judgeTokens: 1_500 });
    expect(act).toBeGreaterThan(0);
  });

  it("reports manual-research hours saved as a positive number", () => {
    expect(timeSavedHours()).toBeGreaterThan(0);
  });
});
