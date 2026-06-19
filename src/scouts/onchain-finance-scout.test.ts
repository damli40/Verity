import { describe, it, expect } from "vitest";
import { resolveTargets } from "./onchain-finance-scout.js";
import type { AllowlistEntry } from "../types.js";

const allowlist: AllowlistEntry[] = [
  { name: "SPCXx", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, category: "tokenized-treasuries", status: "verified", provenance: "verified" },
];

describe("resolveTargets", () => {
  it("returns only entities that resolve to allowlisted addresses", () => {
    const resolved = resolveTargets(["SPCXx", "UnknownToken"], allowlist);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].name).toBe("SPCXx");
  });

  it("never invents an address for an unknown entity", () => {
    const resolved = resolveTargets(["UnknownToken"], allowlist);
    expect(resolved).toHaveLength(0);
  });
});
