import { describe, it, expect } from "vitest";
import { matchOnchain } from "./match-onchain.js";
import type { AllowlistEntry, RwaCandidate } from "../types.js";
import type { ResolvedAddress } from "./resolve-address.js";

const USDY = "0x5bE26527e817998A7206475496fDE1E68957c5A6";
const allowlist: AllowlistEntry[] = [
  { name: "USDY", address: USDY, chainId: 5000,
    category: "tokenized-treasuries", status: "verified", provenance: "Ondo docs" },
];
const cand = (name: string, category: RwaCandidate["category"] = "other"): RwaCandidate =>
  ({ name, issuer: "x", category, networks: ["Mantle"] });
const resolves = (address: string, category: RwaCandidate["category"] = "other"): ResolvedAddress =>
  ({ address, category, provenance: "issuer-official ∩ on-chain" });

describe("matchOnchain", () => {
  it("returns the existing allowlist entry when an issuer-confirmed address is already on it", async () => {
    const r = await matchOnchain([cand("USDY", "tokenized-treasuries")], allowlist,
      async () => resolves(USDY, "tokenized-treasuries"));
    expect(r.verified.map((e) => e.name)).toEqual(["USDY"]);
    expect(r.verified[0].provenance).toBe("Ondo docs"); // existing entry preserved
    expect(r.quarantined).toEqual([]);
  });
  it("auto-promotes a NEW issuer-confirmed candidate to a synthesized verified entry", async () => {
    const newAddr = "0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3";
    const r = await matchOnchain([cand("mUSD", "tokenized-treasuries")], allowlist,
      async () => resolves(newAddr, "tokenized-treasuries"));
    expect(r.verified).toHaveLength(1);
    expect(r.verified[0]).toMatchObject({
      name: "mUSD", address: newAddr, chainId: 5000, category: "tokenized-treasuries", status: "verified",
    });
    expect(r.verified[0].provenance).toContain("issuer-official");
    expect(r.quarantined).toEqual([]);
  });
  it("quarantines a candidate the resolver could not confirm (null)", async () => {
    const r = await matchOnchain([cand("Ghost")], allowlist, async () => null);
    expect(r.verified).toEqual([]);
    expect(r.quarantined.map((c) => c.name)).toEqual(["Ghost"]);
  });
});
