/** Where a number came from. Dune = recomputable; scrape = corroborated; source = context only. */
export type ProvenanceRef =
  | { kind: "dune"; queryId: number; column: string; row: number }
  | { kind: "scrape"; domain: string; url: string; scrapedAt: string; scope: "global" | "mantle-specific"; figure: string }
  | { kind: "source"; url: string };

/** RWA asset categories used to group claims and allowlist entries. */
export type RwaCategory =
  | "tokenized-treasuries"
  | "tokenized-equities"
  | "index-fund"
  | "private-credit"
  | "commodities"
  | "real-estate"
  | "other";

/** Trust tier a claim earns after the gate runs. */
export type ClaimTier = "verified" | "corroborated" | "forward-looking";

/** What a web source is trusted to do. */
export type SourceRole = "discovery" | "corroboration";

export interface SourceAllowlistEntry {
  domain: string;
  roles: SourceRole[];
}

/** A page captured this run; the checker string-matches scrape figures against `text`. */
export interface ScrapeResult {
  url: string;
  domain: string;
  text: string;
  scrapedAt: string; // ISO timestamp
}

/** A candidate RWA asset discovered from a registry, before on-chain matching. */
export interface RwaCandidate {
  name: string;
  issuer: string;
  category: RwaCategory;
  networks: string[];
}

/** A single numeric fact asserted in the report. */
export interface Metric {
  label: string;
  value: number;
  unit?: string;
  /** Allowlisted contract address this metric pertains to, if any. */
  address?: string;
  provenance: ProvenanceRef;
}

export interface ConfidenceSignals {
  sourceQuality: number;   // 0..1
  sourceAgreement: number; // 0..1
  freshness: number;       // 0..1
  onchainVerified: boolean;
}

/** A discrete assertion in the report. */
export interface Claim {
  id: string;
  text: string;
  metrics: Metric[];
  /** Speculative / forward-looking claims (e.g. "InsightX may drive adoption"). */
  forwardLooking: boolean;
  confidence?: number;     // 0..100, set by the confidence scorer
  signals?: ConfidenceSignals;
  category?: RwaCategory;  // set by the synthesizer
  tier?: ClaimTier;        // derived post-gate
}

export interface Report {
  question: string;
  asOf: string;            // ISO date the report's data is current as of
  claims: Claim[];
}

/** A fetched Dune query result, used by scouts and the checker. */
export interface DuneResultRef {
  queryId: number;
  rows: Record<string, unknown>[];
  executedAt: string;      // ISO timestamp
}

export interface AllowlistEntry {
  name: string;
  address: string;         // EIP-55 checksummed
  chainId: number;
  category: RwaCategory;
  status: "verified" | "quarantined";
  provenance: string;      // human note: where the address was confirmed
}

export interface CheckFailure {
  claimId: string;
  metricLabel?: string;
  reason: string;
}

export interface CheckResult {
  passed: boolean;
  failures: CheckFailure[];
}
