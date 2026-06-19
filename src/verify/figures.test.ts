import { describe, it, expect } from "vitest";
import { parseFigure } from "./figures.js";

describe("parseFigure", () => {
  it("parses M/B/K suffixes (case-insensitive) with $ and commas", () => {
    expect(parseFigure("$247.5M")).toBe(247_500_000);
    expect(parseFigure("2.15B")).toBe(2_150_000_000);
    expect(parseFigure("$1,234")).toBe(1_234);
    expect(parseFigure("241,080,948")).toBe(241_080_948);
    expect(parseFigure("3.55")).toBe(3.55);
    expect(parseFigure("0")).toBe(0);
  });
  it("returns null for non-numeric strings", () => {
    expect(parseFigure("Daily")).toBeNull();
    expect(parseFigure("")).toBeNull();
    expect(parseFigure("$1.2.3M")).toBeNull();
  });
});
