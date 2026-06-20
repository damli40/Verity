import type { RwaCandidate, RwaCategory, SourceAllowlistEntry } from "../types.js";
import { issuerOfficialUrl } from "../verify/source-allowlist.js";

const ADDR_RE = /0x[a-fA-F0-9]{40}/g;

/**
 * Strictly extract the issuer-confirmed contract address for a candidate from its issuer-official page text.
 * The Cardinal Rule (§5) lives here: an address is trusted ONLY when the issuer's own page confirms it.
 * - With a claimedAddress: return it iff that exact address (case-insensitive) appears literally in the page.
 * - Without one: return the page's single address iff exactly one distinct address is present (unambiguous).
 * Pure — no I/O.
 */
export function matchIssuerAddress(claimedAddress: string | undefined, issuerPageText: string): string | null {
  const found = [...issuerPageText.matchAll(ADDR_RE)].map((m) => m[0]);
  const distinct = [...new Set(found.map((a) => a.toLowerCase()))];
  if (claimedAddress) {
    return distinct.includes(claimedAddress.toLowerCase()) ? claimedAddress : null;
  }
  return distinct.length === 1 ? found[0] : null;
}

/** A candidate resolved to a trusted on-chain address (issuer-official ∩ on-chain confirmed). */
export interface ResolvedAddress {
  address: string;
  category: RwaCategory;
  provenance: string;
}

export interface LookupDeps {
  list: SourceAllowlistEntry[];
  fetchText: (url: string) => Promise<string>;
  confirmOnchain: (address: string) => Promise<boolean>;
}

/**
 * Compose issuer-official confirmation: resolve the issuer's official domain, fetch it, require the page
 * to confirm the address (matchIssuerAddress), then require on-chain ERC-20 confirmation. Any failure ⇒
 * null (the caller quarantines). Never trusts a bare registry claim.
 */
export function makeLookup(deps: LookupDeps): (c: RwaCandidate) => Promise<ResolvedAddress | null> {
  return async (c) => {
    const url = issuerOfficialUrl(c.issuer, deps.list);
    if (!url) return null;
    const text = await deps.fetchText(url).catch(() => "");
    const address = matchIssuerAddress(c.claimedAddress, text);
    if (!address) return null;
    const ok = await deps.confirmOnchain(address).catch(() => false);
    if (!ok) return null;
    return {
      address,
      category: c.category,
      provenance: `Issuer-official source ${url} confirms ${address}; on-chain ERC-20 verified on Mantle (chainId 5000).`,
    };
  };
}
