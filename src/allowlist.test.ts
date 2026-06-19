import { describe, it, expect } from "vitest";
import { loadAllowlist, isAllowed } from "./allowlist.js";
import type { AllowlistEntry } from "./types.js";

describe("allowlist", () => {
  const list: AllowlistEntry[] = [
    { name: "A", address: "0xAbC0000000000000000000000000000000000001", chainId: 5000, category: "tokenized-treasuries", status: "verified", provenance: "test" },
  ];

  it("matches addresses case-insensitively", () => {
    expect(isAllowed("0xabc0000000000000000000000000000000000001", list)).toBe(true);
  });

  it("rejects unknown addresses", () => {
    expect(isAllowed("0x00000000000000000000000000000000000000ff", list)).toBe(false);
  });

  it("loads entries from a JSON file path", () => {
    const loaded = loadAllowlist("data/allowlist.json");
    expect(Array.isArray(loaded)).toBe(true);
  });
});
