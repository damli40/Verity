import { describe, it, expect } from "vitest";
import { renderChartSvg } from "./chart-svg.js";
import type { ChartSpec } from "../types.js";

describe("renderChartSvg", () => {
  it("renders an inline SVG bar chart with the values and labels", () => {
    const chart: ChartSpec = { type: "bar", labels: ["USDY", "mUSD"], values: [25_900_000, 57_700] };
    const svg = renderChartSvg(chart);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
    expect(svg).toContain("<rect");      // bars
    expect(svg).toContain("USDY");        // category label
  });
  it("renders a polyline for a line chart", () => {
    const svg = renderChartSvg({ type: "line", labels: ["Q1", "Q2"], values: [195, 247] });
    expect(svg).toContain("<polyline");
  });
  it("renders arcs for a doughnut chart", () => {
    const svg = renderChartSvg({ type: "doughnut", labels: ["A", "B"], values: [60, 40] });
    expect(svg).toContain("<path");
  });
  it("produces no external references (offline / recomputable)", () => {
    const svg = renderChartSvg({ type: "bar", labels: ["A", "B"], values: [1, 2] });
    expect(svg).not.toContain("http");
  });
});
