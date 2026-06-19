import { describe, it, expect } from "vitest";
import { deriveTier } from "./tier.js";
import type { Claim } from "../types.js";

const dune = (): Claim => ({
  id: "a", text: "t", forwardLooking: false,
  metrics: [{ label: "x", value: 1, provenance: { kind: "dune", queryId: 1, column: "c", row: 0 } }],
});
const scrape = (): Claim => ({
  id: "b", text: "t", forwardLooking: false,
  metrics: [{ label: "x", value: 1, provenance: { kind: "scrape", domain: "d", url: "u", scrapedAt: "2026-06-17", scope: "mantle-specific", figure: "1" } }],
});

describe("deriveTier", () => {
  it("verified when all numeric metrics are dune", () => {
    expect(deriveTier(dune())).toBe("verified");
  });
  it("corroborated when any numeric metric is a scrape", () => {
    const c = dune();
    c.metrics.push(scrape().metrics[0]);
    expect(deriveTier(c)).toBe("corroborated");
  });
  it("forward-looking when there are no numeric metrics", () => {
    expect(deriveTier({ id: "c", text: "may grow", forwardLooking: true, metrics: [] })).toBe("forward-looking");
  });
});
