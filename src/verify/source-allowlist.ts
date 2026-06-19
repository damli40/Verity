import { readFileSync } from "node:fs";
import type { SourceAllowlistEntry, SourceRole } from "../types.js";

export function loadSourceAllowlist(path: string): SourceAllowlistEntry[] {
  return JSON.parse(readFileSync(path, "utf8")) as SourceAllowlistEntry[];
}

/** True iff `domain` is on the allowlist AND carries `role`. Off-list ⇒ false (mirror of address allowlist). */
export function hasRole(domain: string, role: SourceRole, list: SourceAllowlistEntry[]): boolean {
  const d = domain.toLowerCase();
  return list.some((e) => e.domain.toLowerCase() === d && e.roles.includes(role));
}
