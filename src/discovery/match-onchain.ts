import type { AllowlistEntry, RwaCandidate } from "../types.js";
import type { ResolvedAddress } from "./resolve-address.js";

export interface DiscoveryResult {
  verified: AllowlistEntry[];
  quarantined: RwaCandidate[];
}

/**
 * Resolve each candidate via `lookup` (issuer-official ∩ on-chain). A non-null resolution is
 * issuer-confirmed by construction → verified: reuse the existing allowlist entry when the address is
 * already on it, otherwise synthesize a `status:"verified"` entry (the deliberate auto-promotion, spec §5
 * decision 5 — gated on issuer-source agreement, never a bare registry claim). Unresolved ⇒ quarantined.
 */
export async function matchOnchain(
  candidates: RwaCandidate[],
  allowlist: AllowlistEntry[],
  lookup: (c: RwaCandidate) => Promise<ResolvedAddress | null>,
): Promise<DiscoveryResult> {
  const verifiedByAddr = new Map(
    allowlist.filter((e) => e.status === "verified").map((e) => [e.address.toLowerCase(), e]),
  );
  const verified: AllowlistEntry[] = [];
  const quarantined: RwaCandidate[] = [];
  for (const c of candidates) {
    const resolved = await lookup(c);
    if (!resolved) {
      quarantined.push(c);
      continue;
    }
    const existing = verifiedByAddr.get(resolved.address.toLowerCase());
    verified.push(
      existing ?? {
        name: c.name,
        address: resolved.address,
        chainId: 5000,
        category: resolved.category,
        status: "verified",
        provenance: resolved.provenance,
      },
    );
  }
  return { verified, quarantined };
}
