import { describe, it, expect } from "vitest";
import { selectChart } from "./charts.js";
import type { Metric } from "../types.js";

const m = (label: string, value: number, unit?: string): Metric =>
  ({ label, value, unit, provenance: { kind: "dune", queryId: 1, column: "c", row: 0 } });

describe("selectChart", () => {
  it("returns null for fewer than two metrics", () => {
    expect(selectChart([m("RWA TVL", 1)])).toBeNull();
    expect(selectChart([])).toBeNull();
  });
  it("picks line for temporal labels", () => {
    const c = selectChart([m("Q1 2026 TVL", 195_000_000), m("Q2 2026 TVL", 247_500_000)]);
    expect(c).toEqual({ type: "line", labels: ["Q1 2026 TVL", "Q2 2026 TVL"], values: [195_000_000, 247_500_000] });
  });
  it("picks doughnut when every metric is a share", () => {
    const c = selectChart([m("Treasuries share", 60, "%"), m("Equities share", 40, "%")]);
    expect(c?.type).toBe("doughnut");
  });
  it("picks bar otherwise", () => {
    const c = selectChart([m("USDY supply", 25_900_000), m("mUSD supply", 57_700)]);
    expect(c?.type).toBe("bar");
  });
});
