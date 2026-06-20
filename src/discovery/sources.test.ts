import { describe, it, expect } from "vitest";
import { toRawCandidate } from "./sources.js";

describe("toRawCandidate", () => {
  it("maps a full extracted row (networks array) into a RawCandidate carrying the source url", () => {
    const row = { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries",
      networks: ["Mantle"], address: "0x5bE2…" };
    expect(toRawCandidate(row, "https://app.rwa.xyz/x")).toEqual({
      name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Mantle"],
      claimedAddress: "0x5bE2…", sourceUrl: "https://app.rwa.xyz/x",
    });
  });
  it("accepts a singular `network` string and leaves missing fields undefined", () => {
    expect(toRawCandidate({ name: "MI4", network: "Mantle" }, "https://defillama.com")).toEqual({
      name: "MI4", issuer: undefined, category: undefined, networks: ["Mantle"],
      claimedAddress: undefined, sourceUrl: "https://defillama.com",
    });
  });
});
