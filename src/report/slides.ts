import type { Report, Claim, Slide, RwaCategory } from "../types.js";
import { RWA_CATEGORIES } from "../types.js";
import { selectChart } from "./charts.js";

export interface DeckMeta {
  cost: { estimateUsd: number; actualUsd: number; timeSavedHours: number };
  /**
   * On-chain anchor identifiers, known BEFORE rendering. The attestation tx is deliberately NOT
   * embedded: the PDF's keccak256 is what gets anchored, so the bytes must be final before hashing
   * (embedding the tx would make the published file's hash differ from the attested one).
   */
  anchor?: { agentId: string; registry: string; chain: string };
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

function headlineOf(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return firstSentence.trim();
}

function captionOf(c: Claim): string {
  const p = c.metrics[0]?.provenance;
  if (!p) return "Forward-looking — no on-chain figure";
  if (p.kind === "dune") return `Dune #${p.queryId}`;
  if (p.kind === "scrape") return `${p.domain}, scraped ${p.scrapedAt.slice(0, 10)}`;
  return p.url;
}

function calloutOf(c: Claim): string | undefined {
  const m = c.metrics[0];
  if (!m) return undefined;
  const v = Math.abs(m.value) >= 1e6 ? `$${(m.value / 1e6).toFixed(1)}M` : m.value.toLocaleString();
  return `${m.label}: ${v}`;
}

function sourcesOf(report: Report): { label: string; detail: string }[] {
  const out: { label: string; detail: string }[] = [];
  const seen = new Set<string>();
  for (const c of report.claims) {
    for (const m of c.metrics) {
      const p = m.provenance;
      let label = "Source";
      let detail = "";
      if (p.kind === "dune") { label = `Dune #${p.queryId}`; detail = `https://dune.com/queries/${p.queryId}`; }
      else if (p.kind === "scrape") { label = p.domain; detail = `${p.url} (scraped ${p.scrapedAt.slice(0, 10)})`; }
      else { detail = p.url; }
      if (seen.has(detail)) continue;
      seen.add(detail);
      out.push({ label, detail });
    }
  }
  return out;
}

/** Build the ordered slide model. Pure. Groups claims by RWA category in canonical order. */
export function buildDeck(report: Report, _meta: DeckMeta): Slide[] {
  const byCat = new Map<RwaCategory, Claim[]>();
  for (const c of report.claims) {
    const cat = c.category ?? "other";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(c);
  }
  const cats = RWA_CATEGORIES.filter((c) => byCat.has(c));

  // Page layout: 1=cover, 2=toc, then each section (divider + N content), then appendix.
  let page = 3;
  const sections = cats.map((cat, i) => {
    const claims = byCat.get(cat)!;
    const start = page;
    const end = page + claims.length; // divider page + claims.length content pages
    page = end + 1;
    return { numeral: ROMAN[i] ?? `${i + 1}`, category: cat, pageRange: `${start}–${end}`, claims };
  });

  const slides: Slide[] = [];
  slides.push({ kind: "cover", title: report.question, asOf: report.asOf });
  slides.push({ kind: "toc", sections: sections.map((s) => ({ numeral: s.numeral, category: s.category, pageRange: s.pageRange })) });
  for (const s of sections) {
    slides.push({ kind: "divider", numeral: s.numeral, category: s.category });
    for (const c of s.claims) {
      slides.push({
        kind: "content",
        headline: headlineOf(c.text),
        body: c.text,
        tier: c.tier ?? "forward-looking",
        sourceCaption: captionOf(c),
        chart: selectChart(c.metrics) ?? undefined,
        callout: calloutOf(c),
      });
    }
  }
  slides.push({ kind: "appendix", sources: sourcesOf(report) });
  return slides;
}
