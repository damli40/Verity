import { describe, it, expect } from "vitest";
import { matchIssuerAddress } from "./resolve-address.js";

const USDY = "0x5bE26527e817998A7206475496fDE1E68957c5A6";

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
