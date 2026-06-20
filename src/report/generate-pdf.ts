import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

/** Renders HTML to PDF via headless Chromium, waiting for Chart.js to draw. */
export async function htmlToPdf(html: string, outPath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    // Charts are inline SVG (vector) — no canvas paint to wait for, and they rasterize
    // reliably into the PDF (unlike <canvas>, which Chromium's print backend drops).
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, landscape: true });
    writeFileSync(outPath, pdf);
  } finally {
    await browser.close();
  }
}
