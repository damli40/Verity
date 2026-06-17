import { describe, it, expect } from "vitest";
import { hashFile } from "./hash.js";
import { writeFileSync, rmSync } from "node:fs";

describe("hashFile", () => {
  it("produces a stable 0x-prefixed keccak256 of file bytes", () => {
    writeFileSync("/tmp/verity-hash-test.bin", "hello verity");
    const h = hashFile("/tmp/verity-hash-test.bin");
    rmSync("/tmp/verity-hash-test.bin");
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
