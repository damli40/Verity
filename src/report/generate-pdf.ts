import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

/** Renders HTML to PDF via headless Chromium, waiting for Chart.js to draw. */
export async function htmlToPdf(html: string, outPath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.waitForTimeout(600); // let the chart paint
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm" } });
    writeFileSync(outPath, pdf);
  } finally {
    await browser.close();
  }
}
