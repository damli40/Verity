import { describe, it, expect } from "vitest";
import { captureScrapes } from "./scrape-scout.js";

describe("captureScrapes", () => {
  it("captures full page text per target and stamps scrapedAt", async () => {
    const fetchText = async (url: string) =>
      url.includes("Mantle") ? "Mantle RWA total value is $241,080,948." : "other";
    const out = await captureScrapes(
      [{ url: "https://defillama.com/chain/Mantle", domain: "defillama.com" }],
      fetchText,
      "2026-06-19T00:00:00Z",
    );
    expect(out).toEqual([
      {
        url: "https://defillama.com/chain/Mantle",
        domain: "defillama.com",
        text: "Mantle RWA total value is $241,080,948.",
        scrapedAt: "2026-06-19T00:00:00Z",
      },
    ]);
  });
});
