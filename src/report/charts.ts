import type { Metric, ChartSpec } from "../types.js";

const TEMPORAL = /\bq[1-4]\b|\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

function isTemporal(label: string): boolean {
  return TEMPORAL.test(label);
}
function isShare(m: Metric): boolean {
  return m.unit === "%" || /%|share/i.test(m.label);
}

/**
 * Pick a chart type from the shape of a claim's metrics. Deterministic:
 * temporal labels → line; all-share metrics → doughnut; otherwise comparative bar.
 * Returns null when there are not enough points to chart (< 2 metrics).
 */
export function selectChart(metrics: Metric[]): ChartSpec | null {
  if (metrics.length < 2) return null;
  const labels = metrics.map((m) => m.label);
  const values = metrics.map((m) => m.value);
  let type: ChartSpec["type"] = "bar";
  if (labels.every(isTemporal)) type = "line";
  else if (metrics.every(isShare)) type = "doughnut";
  return { type, labels, values };
}
