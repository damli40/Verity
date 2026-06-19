import type { RwaCandidate, RwaCategory } from "../types.js";

/** A raw row as pulled from a discovery registry, before normalization. */
export interface RawCandidate {
  name?: string;
  issuer?: string;
  category?: string;
  networks?: string[];
}

const CATEGORIES: RwaCategory[] = [
  "tokenized-treasuries",
  "tokenized-equities",
  "index-fund",
  "private-credit",
  "commodities",
  "real-estate",
  "other",
];

function coerceCategory(c: string | undefined): RwaCategory {
  return (CATEGORIES as string[]).includes(c ?? "") ? (c as RwaCategory) : "other";
}

function onMantle(networks: string[] | undefined): boolean {
  return (networks ?? []).some((n) => n.toLowerCase() === "mantle");
}

/**
 * Normalize raw registry rows into Mantle-only RWA candidates.
 * Pure: drops non-Mantle rows and rows without a name, coerces unknown categories to "other",
 * defaults missing issuer to "", and dedupes by lowercased name (first occurrence wins).
 */
export function parseCandidates(raw: RawCandidate[]): RwaCandidate[] {
  const out: RwaCandidate[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r.name || !onMantle(r.networks)) continue;
    const key = r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: r.name,
      issuer: r.issuer ?? "",
      category: coerceCategory(r.category),
      networks: r.networks ?? [],
    });
  }
  return out;
}

/** Fetch discovery-role domains (injected) and normalize to candidates. */
export async function runRegistryScout(
  fetchCandidates: (domain: string) => Promise<RawCandidate[]>,
  domains: string[],
): Promise<RwaCandidate[]> {
  const pages = await Promise.all(domains.map((d) => fetchCandidates(d)));
  return parseCandidates(pages.flat());
}
