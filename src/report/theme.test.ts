import { describe, it, expect } from "vitest";
import { TIER_COLORS, TIER_LABELS, themeCss } from "./theme.js";

describe("theme", () => {
  it("defines a color + label for every tier", () => {
    for (const t of ["verified", "corroborated", "forward-looking"] as const) {
      expect(TIER_COLORS[t]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(TIER_LABELS[t].length).toBeGreaterThan(0);
    }
  });
  it("emits landscape @page sizing and uses the tier colors", () => {
    const css = themeCss();
    expect(css).toMatch(/@page[^}]*landscape/);
    expect(css).toContain(TIER_COLORS.verified);
    expect(css).toContain(TIER_COLORS.corroborated);
    expect(css).toContain(TIER_COLORS["forward-looking"]);
  });
});
