export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

interface ExaResponse {
  results: { title?: string; url: string; text?: string }[];
}

export function shapeExaResults(api: ExaResponse): WebSource[] {
  return api.results.map((r) => ({ title: r.title ?? "", url: r.url, snippet: (r.text ?? "").slice(0, 500) }));
}

/** Search the web via Exa for qualitative context + citable sources. */
export async function runWebScout(query: string, exaApiKey: string): Promise<WebSource[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": exaApiKey },
    body: JSON.stringify({ query, numResults: 6, contents: { text: true } }),
  });
  if (!res.ok) throw new Error(`Exa search failed: ${res.status} ${await res.text()}`);
  return shapeExaResults((await res.json()) as ExaResponse);
}
