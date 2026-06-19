import { describe, it, expect } from "vitest";
import { matchOnchain } from "./match-onchain.js";
import type { AllowlistEntry, RwaCandidate } from "../types.js";

const allowlist: AllowlistEntry[] = [
  { name: "USDY", address: "0x5bE26527e817998A7206475496fDE1E68957c5A6", chainId: 5000,
    category: "tokenized-treasuries", status: "verified", provenance: "Ondo docs" },
];
const cand = (name: string, category: RwaCandidate["category"] = "other"): RwaCandidate =>
  ({ name, issuer: "x", category, networks: ["Mantle"] });

describe("matchOnchain", () => {
  it("marks a candidate verified when its on-chain address is on the verified allowlist (case-insensitive)", () => {
    const lookup = () => "0x5be26527e817998a7206475496fde1e68957c5a6"; // lowercased on purpose
    const r = matchOnchain([cand("USDY", "tokenized-treasuries")], allowlist, lookup);
    expect(r.verified.map((e) => e.name)).toEqual(["USDY"]);
    expect(r.quarantined).toEqual([]);
  });
  it("quarantines a candidate that resolves to an off-allowlist address", () => {
    const lookup = () => "0xdeadbeef00000000000000000000000000000000";
    const r = matchOnchain([cand("MysteryRWA")], allowlist, lookup);
    expect(r.verified).toEqual([]);
    expect(r.quarantined.map((c) => c.name)).toEqual(["MysteryRWA"]);
  });
  it("quarantines a candidate that does not resolve on-chain (null)", () => {
    const r = matchOnchain([cand("Ghost")], allowlist, () => null);
    expect(r.verified).toEqual([]);
    expect(r.quarantined.map((c) => c.name)).toEqual(["Ghost"]);
  });
});
