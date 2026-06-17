/** Where a number came from. Either a re-runnable Dune query cell or a cited URL. */
export type ProvenanceRef =
  | { kind: "dune"; queryId: number; column: string; row: number }
  | { kind: "source"; url: string };

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
