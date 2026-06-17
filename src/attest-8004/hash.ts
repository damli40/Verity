import { readFileSync } from "node:fs";
import { keccak256, toHex } from "viem";

/** keccak256 of a file's raw bytes — the recomputable hash anchored on-chain. */
export function hashFile(path: string): `0x${string}` {
  const bytes = readFileSync(path);
  return keccak256(toHex(bytes));
}
