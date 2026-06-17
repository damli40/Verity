import { describe, it, expect } from "vitest";
import { shapeExaResults } from "./web-scout.js";

describe("shapeExaResults", () => {
  it("maps Exa results to {title, url, snippet}", () => {
    const api = { results: [{ title: "Mantle RWA", url: "https://x.com/a", text: "TVL up" }] };
    const out = shapeExaResults(api);
    expect(out[0]).toEqual({ title: "Mantle RWA", url: "https://x.com/a", snippet: "TVL up" });
  });
});
