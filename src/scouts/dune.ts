import type { DuneResultRef } from "../types.js";

interface DuneResultsResponse {
  execution_id: string;
  execution_ended_at?: string;
  result?: { rows: Record<string, unknown>[] };
}

/** Pure shaper: turns Dune's API payload into our internal DuneResultRef. */
export function shapeDuneResult(queryId: number, api: DuneResultsResponse): DuneResultRef {
  return {
    queryId,
    rows: api.result?.rows ?? [],
    executedAt: api.execution_ended_at ?? new Date().toISOString(),
  };
}

/** Fetches the latest cached results for a saved Dune query. Reuse-first; no new execution. */
export async function getLatestDuneResults(queryId: number, apiKey: string): Promise<DuneResultRef> {
  const res = await fetch(`https://api.dune.com/api/v1/query/${queryId}/results`, {
    headers: { "X-Dune-API-Key": apiKey },
  });
  if (!res.ok) throw new Error(`Dune results ${queryId} failed: ${res.status} ${await res.text()}`);
  return shapeDuneResult(queryId, (await res.json()) as DuneResultsResponse);
}
