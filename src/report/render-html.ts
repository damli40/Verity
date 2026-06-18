import type { Report } from "../types.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const CHART_JS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../node_modules/chart.js/dist/chart.umd.js"),
  "utf8",
);

export interface ReportMeta {
  attestationTx: string;
  cost: { estimateUsd: number; actualUsd: number; timeSavedHours: number };
}

export function renderReportHtml(report: Report, meta: ReportMeta): string {
  const claimRows = report.claims
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.text)}</td><td>${c.confidence ?? "—"}</td><td>${
          c.forwardLooking ? "forward-looking" : "verified"
        }</td></tr>`,
    )
    .join("");

  const sourceItems = report.claims
    .flatMap((c) => c.metrics)
    .map((m) =>
      m.provenance.kind === "dune"
        ? `<li>Dune query <a href="https://dune.com/queries/${m.provenance.queryId}">#${m.provenance.queryId}</a> — ${escapeHtml(
            m.label,
          )}${m.address ? ` (addr ${m.address})` : ""}</li>`
        : `<li><a href="${m.provenance.url}">${escapeHtml(m.provenance.url)}</a></li>`,
    )
    .join("");

  const labels = report.claims.flatMap((c) => c.metrics.map((m) => m.label));
  const values = report.claims.flatMap((c) => c.metrics.map((m) => m.value));

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Verity — ${escapeHtml(report.question)}</title>
<script>${CHART_JS}</script>
<style>
 body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:48px;color:#111}
 h1{font-size:22px} table{border-collapse:collapse;width:100%;margin:16px 0}
 th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
 .meta{color:#555;font-size:12px} canvas{max-width:640px}
</style></head><body>
<h1>Verity Research Report</h1>
<p class="meta">Question: <b>${escapeHtml(report.question)}</b> · As of ${report.asOf}</p>
<h2>Claims</h2>
<table><thead><tr><th>Claim</th><th>Confidence</th><th>Status</th></tr></thead><tbody>${claimRows}</tbody></table>
<h2>Data</h2><canvas id="chart"></canvas>
<script>
 new Chart(document.getElementById('chart'), {
   type:'bar',
   data:{ labels:${JSON.stringify(labels)}, datasets:[{ label:'Value', data:${JSON.stringify(values)} }] },
   options:{ animation:false, plugins:{ legend:{ display:false } } }
 });
</script>
<h2>Sources (re-runnable)</h2><ul>${sourceItems}</ul>
<h2>Cost & Time</h2>
<p class="meta">Estimated compute: $${meta.cost.estimateUsd.toFixed(2)} · Actual compute: $${meta.cost.actualUsd.toFixed(
    2,
  )} · Time saved vs manual: ~${meta.cost.timeSavedHours}h</p>
<h2>Attestation</h2>
<p class="meta">ERC-8004 (Mantle): <a href="https://explorer.mantle.xyz/tx/${meta.attestationTx}">${meta.attestationTx}</a></p>
</body></html>`;
}

function escapeHtml(s: string | undefined | null): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
