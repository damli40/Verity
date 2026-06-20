import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { Report, Slide, ChartSpec, RwaCategory } from "../types.js";
import { themeCss, TIER_LABELS } from "./theme.js";
import { buildDeck, type DeckMeta } from "./slides.js";

export type ReportMeta = DeckMeta;

const CHART_JS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../node_modules/chart.js/dist/chart.umd.js"),
  "utf8",
);

function escapeHtml(s: string | undefined | null): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function titleCase(cat: RwaCategory): string {
  return cat.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function footer(page: number, total: number): string {
  return `<div class="footer"><span>Verity · Mantle RWA</span><span>${page} / ${total}</span></div>`;
}

function chartScript(id: string, chart: ChartSpec): string {
  return `<script>new Chart(document.getElementById('${id}'),{type:'${chart.type}',` +
    `data:{labels:${JSON.stringify(chart.labels)},datasets:[{label:'',data:${JSON.stringify(chart.values)},` +
    `backgroundColor:['#1f6f8b','#123a63','#b8860b','#1a7f4b','#6b7280'],borderColor:'#123a63',fill:false}]},` +
    `options:{animation:false,plugins:{legend:{display:${chart.type === "doughnut"}}}}});</script>`;
}

function renderSlide(slide: Slide, page: number, total: number, charts: string[]): string {
  switch (slide.kind) {
    case "cover":
      return `<section class="slide cover"><div class="kicker">Verity · Verification-first RWA research</div>` +
        `<h1>${escapeHtml(slide.title)}</h1><div class="asof">Data as of ${escapeHtml(slide.asOf)}</div></section>`;
    case "toc": {
      const items = slide.sections
        .map((s) => `<li><b>${s.numeral}.</b> ${escapeHtml(titleCase(s.category))} <span class="pages">${s.pageRange}</span></li>`)
        .join("");
      return `<section class="slide toc"><h2>Contents</h2><ol>${items}</ol>${footer(page, total)}</section>`;
    }
    case "divider":
      return `<section class="slide divider"><div class="numeral">${slide.numeral}</div>` +
        `<h2>${escapeHtml(titleCase(slide.category))}</h2>${footer(page, total)}</section>`;
    case "content": {
      let panel = "";
      if (slide.chart) {
        const id = `chart${page}`;
        panel = `<div class="panel"><canvas id="${id}"></canvas></div>`;
        charts.push(chartScript(id, slide.chart));
      }
      const callout = slide.callout ? `<div class="callout">${escapeHtml(slide.callout)}</div>` : "";
      return `<section class="slide content"><span class="badge ${slide.tier}">${escapeHtml(TIER_LABELS[slide.tier])}</span>` +
        `<h1>${escapeHtml(slide.headline)}</h1>${panel}<div class="body">${escapeHtml(slide.body)}</div>${callout}` +
        `<div class="caption">${escapeHtml(slide.sourceCaption)}</div>${footer(page, total)}</section>`;
    }
    case "appendix": {
      const items = slide.sources
        .map((s) => `<li><b>${escapeHtml(s.label)}</b> — ${escapeHtml(s.detail)}</li>`)
        .join("");
      return `<section class="slide appendix"><h2>Sources (re-runnable)</h2><ul>${items}</ul>${footer(page, total)}</section>`;
    }
  }
}

/** Render the full landscape deck to self-contained HTML (Chart.js + theme inlined, no CDN). */
export function renderDeck(report: Report, meta: ReportMeta): string {
  const slides = buildDeck(report, meta);
  const total = slides.length;
  const charts: string[] = [];
  const body = slides.map((s, i) => renderSlide(s, i + 1, total, charts)).join("");
  const attestation =
    `<section class="slide appendix"><h2>Attestation & Cost</h2><ul>` +
    `<li><b>ERC-8004 (Mantle)</b> — tx ${escapeHtml(meta.attestationTx)}</li>` +
    `<li><b>Compute</b> — est $${meta.cost.estimateUsd.toFixed(2)} · actual $${meta.cost.actualUsd.toFixed(2)} · ~${meta.cost.timeSavedHours}h saved vs manual</li>` +
    `</ul>${footer(total + 1, total + 1)}</section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Verity — ${escapeHtml(report.question)}</title>` +
    `<script>${CHART_JS}</script><style>${themeCss()}</style></head><body>${body}${attestation}${charts.join("")}</body></html>`;
}
