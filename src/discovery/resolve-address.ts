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
