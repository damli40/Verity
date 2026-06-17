import type { AllowlistEntry, DuneResultRef } from "../types.js";
import { getLatestDuneResults } from "./dune.js";

/** Resolve entity names to allowlisted contracts only. Unknown names are dropped, never guessed. */
export function resolveTargets(entities: string[], allowlist: AllowlistEntry[]): AllowlistEntry[] {
  const byName = new Map(allowlist.map((e) => [e.name.toLowerCase(), e]));
  return entities
    .map((name) => byName.get(name.toLowerCase()))
    .filter((e): e is AllowlistEntry => Boolean(e));
}

/**
 * Pulls the Dune queries this run depends on. `queryIds` are the saved, public, re-runnable
 * queries scoped to allowlisted addresses (reuse-first per spec §4). Returns result refs the
 * checker will verify claims against.
 */
export async function runOnchainScout(queryIds: number[], duneApiKey: string): Promise<DuneResultRef[]> {
  return Promise.all(queryIds.map((id) => getLatestDuneResults(id, duneApiKey)));
}
