import type { ChartSpec } from "../types.js";

const W = 520;
const H = 340;
const ML = 72; // left margin (y labels)
const MR = 16;
const MT = 16;
const MB = 72; // bottom margin (x labels)
const PW = W - ML - MR; // plot width
const PH = H - MT - MB; // plot height
const PALETTE = ["#1f6f8b", "#123a63", "#b8860b", "#1a7f4b", "#6b7280", "#8b94a0"];

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return `${v}`;
}

function clip(label: string, n = 12): string {
  return label.length > n ? `${label.slice(0, n - 1)}…` : label;
}

function svg(inner: string): string {
  return `<svg viewBox="0 0 ${W} ${H}" font-family="-apple-system,Segoe UI,Roboto,sans-serif">${inner}</svg>`;
}

function axes(yMin: number, yMax: number): string {
  let g = "";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const y = MT + (PH * i) / ticks;
    const val = yMax - ((yMax - yMin) * i) / ticks;
    g += `<line x1="${ML}" y1="${y.toFixed(1)}" x2="${ML + PW}" y2="${y.toFixed(1)}" stroke="#e3e7ec" stroke-width="1"/>`;
    g += `<text x="${ML - 8}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#5b6470" text-anchor="end">${esc(fmt(val))}</text>`;
  }
  return g;
}

function xLabels(labels: string[]): string {
  const band = PW / labels.length;
  return labels
    .map((l, i) => {
      const x = ML + band * (i + 0.5);
      const y = MT + PH + 16;
      return `<text x="${x.toFixed(1)}" y="${y}" font-size="9" fill="#5b6470" text-anchor="end" transform="rotate(-25 ${x.toFixed(1)} ${y})">${esc(clip(l))}</text>`;
    })
    .join("");
}

function barChart(c: ChartSpec): string {
  const yMin = Math.min(0, ...c.values);
  const yMax = Math.max(0, ...c.values) * 1.1 || 1;
  const span = yMax - yMin || 1;
  const band = PW / c.values.length;
  const bw = band * 0.6;
  const y0 = MT + PH - ((0 - yMin) / span) * PH; // baseline (value 0)
  const bars = c.values
    .map((v, i) => {
      const h = (Math.abs(v) / span) * PH;
      const x = ML + band * i + (band - bw) / 2;
      const y = v >= 0 ? y0 - h : y0;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${PALETTE[i % PALETTE.length]}"/>` +
        `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="9" fill="#2a313c" text-anchor="middle">${esc(fmt(v))}</text>`;
    })
    .join("");
  return svg(axes(yMin, yMax) + bars + xLabels(c.labels));
}

function lineChart(c: ChartSpec): string {
  const yMin = Math.min(0, ...c.values);
  const yMax = Math.max(0, ...c.values) * 1.1 || 1;
  const span = yMax - yMin || 1;
  const band = PW / c.values.length;
  const pts = c.values.map((v, i) => {
    const x = ML + band * (i + 0.5);
    const y = MT + PH - ((v - yMin) / span) * PH;
    return { x, y, v };
  });
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const dots = pts
    .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#123a63"/>` +
      `<text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" font-size="9" fill="#2a313c" text-anchor="middle">${esc(fmt(p.v))}</text>`)
    .join("");
  return svg(axes(yMin, yMax) + `<polyline points="${poly}" fill="none" stroke="#1f6f8b" stroke-width="2.5"/>` + dots + xLabels(c.labels));
}

function doughnutChart(c: ChartSpec): string {
  const total = c.values.reduce((s, v) => s + Math.abs(v), 0) || 1;
  const cx = ML + PW / 2;
  const cy = MT + PH / 2;
  const r = Math.min(PW, PH) / 2 - 6;
  const inner = r * 0.58;
  let a0 = -Math.PI / 2;
  let segs = "";
  let legend = "";
  c.values.forEach((v, i) => {
    const frac = Math.abs(v) / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const p = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`;
    segs += `<path d="M ${p(r, a0)} A ${r} ${r} 0 ${large} 1 ${p(r, a1)} L ${p(inner, a1)} A ${inner} ${inner} 0 ${large} 0 ${p(inner, a0)} Z" fill="${PALETTE[i % PALETTE.length]}"/>`;
    const ly = MT + 14 + i * 16;
    legend += `<rect x="${(cx + r + 10).toFixed(1)}" y="${ly - 9}" width="10" height="10" fill="${PALETTE[i % PALETTE.length]}"/>` +
      `<text x="${(cx + r + 24).toFixed(1)}" y="${ly}" font-size="10" fill="#2a313c">${esc(clip(c.labels[i], 14))} (${Math.round(frac * 100)}%)</text>`;
    a0 = a1;
  });
  return svg(segs + legend);
}

/** Render a ChartSpec to a self-contained inline SVG (no canvas, no external refs). */
export function renderChartSvg(chart: ChartSpec): string {
  if (chart.type === "line") return lineChart(chart);
  if (chart.type === "doughnut") return doughnutChart(chart);
  return barChart(chart);
}
