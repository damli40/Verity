import { describe, it, expect } from "vitest";
import { loadSourceAllowlist, hasRole, issuerOfficialDomain } from "./source-allowlist.js";
import type { SourceAllowlistEntry } from "../types.js";

const list: SourceAllowlistEntry[] = [
  { domain: "app.rwa.xyz", roles: ["discovery"] },
  { domain: "defillama.com", roles: ["discovery", "corroboration"] },
];

describe("hasRole", () => {
  it("returns true when domain has the role (case-insensitive)", () => {
    expect(hasRole("DefiLlama.com", "corroboration", list)).toBe(true);
  });
  it("returns false when domain lacks the role", () => {
    expect(hasRole("app.rwa.xyz", "corroboration", list)).toBe(false);
  });
  it("returns false for unknown domain", () => {
    expect(hasRole("evil.example", "corroboration", list)).toBe(false);
  });
});

describe("loadSourceAllowlist", () => {
  it("loads the project source allowlist with at least one corroboration domain", () => {
    const l = loadSourceAllowlist("data/source-allowlist.json");
    expect(l.some((e) => e.roles.includes("corroboration"))).toBe(true);
  });
  it("carries at least one issuer-official domain with an issuer name", () => {
    const l = loadSourceAllowlist("data/source-allowlist.json");
    const io = l.filter((e) => e.roles.includes("issuer-official"));
    expect(io.length).toBeGreaterThan(0);
    expect(io.every((e) => typeof e.issuer === "string" && e.issuer.length > 0)).toBe(true);
  });
});

describe("issuerOfficialDomain", () => {
  const l: SourceAllowlistEntry[] = [
    { domain: "docs.ondo.finance", roles: ["issuer-official"], issuer: "Ondo" },
    { domain: "app.rwa.xyz", roles: ["discovery"] },
  ];
  it("returns the issuer-official domain for a known issuer (case-insensitive)", () => {
    expect(issuerOfficialDomain("ondo", l)).toBe("docs.ondo.finance");
  });
  it("returns null for an unknown issuer", () => {
    expect(issuerOfficialDomain("Unknown Co", l)).toBeNull();
  });
  it("returns null when the matching domain lacks the issuer-official role", () => {
    expect(issuerOfficialDomain("rwa.xyz", l)).toBeNull();
  });
});
