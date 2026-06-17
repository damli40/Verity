import { readFileSync } from "node:fs";
import type { AllowlistEntry } from "./types.js";

export function loadAllowlist(path: string): AllowlistEntry[] {
  return JSON.parse(readFileSync(path, "utf8")) as AllowlistEntry[];
}

export function isAllowed(address: string, list: AllowlistEntry[]): boolean {
  const a = address.toLowerCase();
  return list.some((e) => e.address.toLowerCase() === a);
}
