import { describe, it, expect } from "vitest";
import { parseCandidates, runRegistryScout, type RawCandidate } from "./registry-scout.js";

describe("parseCandidates", () => {
  it("keeps Mantle rows, coerces unknown category, defaults issuer, dedupes by name", () => {
    const raw: RawCandidate[] = [
      { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Ethereum", "Mantle"] },
      { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Mantle"] }, // dup
      { name: "MI4", category: "wildcard-thing", networks: ["mantle"] }, // unknown cat → other, missing issuer
      { name: "OffChainOnly", issuer: "X", category: "index-fund", networks: ["Ethereum"] }, // not Mantle → dropped
      { issuer: "NoName", category: "other", networks: ["Mantle"] }, // no name → dropped
    ];
    const out = parseCandidates(raw);
    expect(out).toEqual([
      { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Ethereum", "Mantle"] },
      { name: "MI4", issuer: "", category: "other", networks: ["mantle"] },
    ]);
  });
});

describe("runRegistryScout", () => {
  it("fetches each domain, flattens, and parses", async () => {
    const byDomain: Record<string, RawCandidate[]> = {
      "defillama.com": [{ name: "Syrup USDT", issuer: "Maple", category: "private-credit", networks: ["Mantle"] }],
      "messari.io": [{ name: "xTSLA", issuer: "Backed", category: "tokenized-equities", networks: ["Mantle"] }],
    };
    const out = await runRegistryScout(async (d) => byDomain[d] ?? [], ["defillama.com", "messari.io"]);
    expect(out.map((c) => c.name)).toEqual(["Syrup USDT", "xTSLA"]);
  });
});
