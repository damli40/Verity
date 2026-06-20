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

/** The issuer-official domain registered for `issuer`, or null. Match is case-insensitive on issuer name. */
export function issuerOfficialDomain(issuer: string, list: SourceAllowlistEntry[]): string | null {
  const i = issuer.trim().toLowerCase();
  if (!i) return null;
  const hit = list.find(
    (e) => e.roles.includes("issuer-official") && (e.issuer ?? "").toLowerCase() === i,
  );
  return hit ? hit.domain : null;
}
