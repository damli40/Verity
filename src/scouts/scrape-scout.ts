import type { ScrapeResult } from "../types.js";

export interface ScrapeTarget {
  url: string;
  domain: string;
}

/**
 * Capture full page text for each corroboration target (injected `fetchText`), stamping the
 * capture time. The corroboration gate string-matches model-declared figures against this text,
 * so we keep the whole page, not an Exa snippet. `now` is the run's asOf-aligned timestamp.
 */
export async function captureScrapes(
  targets: ScrapeTarget[],
  fetchText: (url: string) => Promise<string>,
  now: string,
): Promise<ScrapeResult[]> {
  return Promise.all(
    targets.map(async (t) => ({ url: t.url, domain: t.domain, text: await fetchText(t.url), scrapedAt: now })),
  );
}
