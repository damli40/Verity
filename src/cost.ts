export interface TokenUsage {
  synthTokens: number;
  judgeTokens: number;
}

// Blended USD per token (order-of-magnitude; documented as illustrative in the report).
const SYNTH_USD_PER_TOKEN = 15 / 1_000_000; // operator/synth model
const JUDGE_USD_PER_TOKEN = 1 / 1_000_000;  // cheap judge model

function cost(u: TokenUsage): number {
  return u.synthTokens * SYNTH_USD_PER_TOKEN + u.judgeTokens * JUDGE_USD_PER_TOKEN;
}

/** Upfront estimate from the operator's plan. */
export const estimateCost = cost;
/** Reconciliation from observed usage after the run. */
export const actualCost = cost;

/** Conservative estimate of analyst hours to reproduce the same pulls + write-up by hand. */
export function timeSavedHours(): number {
  return 4; // documented assumption: ~half a working day of manual Dune + synthesis
}
