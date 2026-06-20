import { describe, it, expect } from "vitest";
import { matchIssuerAddress, makeLookup } from "./resolve-address.js";
import type { RwaCandidate, SourceAllowlistEntry } from "../types.js";

const USDY = "0x5bE26527e817998A7206475496fDE1E68957c5A6";
const list: SourceAllowlistEntry[] = [
  { domain: "docs.ondo.finance", roles: ["issuer-official"], issuer: "Ondo" },
];
const ondo = (claimedAddress?: string): RwaCandidate =>
  ({ name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Mantle"], claimedAddress });

describe("matchIssuerAddress", () => {
  it("confirms a claimed address that literally appears on the issuer page (case-insensitive)", () => {
    const page = `Mantle deployment: ${USDY.toLowerCase()} — USDY`;
    expect(matchIssuerAddress(USDY, page)).toBe(USDY);
  });
  it("rejects a claimed address the issuer page does not contain (registry claim unconfirmed)", () => {
    const page = `Mantle deployment: 0x1111111111111111111111111111111111111111`;
    expect(matchIssuerAddress(USDY, page)).toBeNull();
  });
  it("returns the sole address when none is claimed and the page is unambiguous", () => {
    expect(matchIssuerAddress(undefined, `Address: ${USDY}`)).toBe(USDY);
  });
  it("returns null when no address is claimed and the page lists several (ambiguous)", () => {
    const page = `${USDY} and 0x1111111111111111111111111111111111111111`;
    expect(matchIssuerAddress(undefined, page)).toBeNull();
  });
  it("returns null when the page has no address at all", () => {
    expect(matchIssuerAddress(USDY, "no addresses here")).toBeNull();
  });
});

describe("makeLookup", () => {
  it("resolves when issuer page confirms the address AND it is a real on-chain ERC-20", async () => {
    const lookup = makeLookup({
      list,
      fetchText: async () => `USDY on Mantle: ${USDY}`,
      confirmOnchain: async () => true,
    });
    const r = await lookup(ondo(USDY));
    expect(r?.address).toBe(USDY);
    expect(r?.category).toBe("tokenized-treasuries");
    expect(r?.provenance).toContain("docs.ondo.finance");
  });
  it("returns null for an unknown issuer (no issuer-official domain)", async () => {
    const lookup = makeLookup({ list, fetchText: async () => USDY, confirmOnchain: async () => true });
    const r = await lookup({ name: "Mystery", issuer: "Nobody", category: "other", networks: ["Mantle"] });
    expect(r).toBeNull();
  });
  it("returns null when the issuer page does not confirm the claimed address", async () => {
    const lookup = makeLookup({ list, fetchText: async () => "no match here", confirmOnchain: async () => true });
    expect(await lookup(ondo(USDY))).toBeNull();
  });
  it("returns null when on-chain confirmation fails (not a real ERC-20)", async () => {
    const lookup = makeLookup({ list, fetchText: async () => `USDY: ${USDY}`, confirmOnchain: async () => false });
    expect(await lookup(ondo(USDY))).toBeNull();
  });
});
