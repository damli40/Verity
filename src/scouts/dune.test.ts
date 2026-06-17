import { describe, it, expect } from "vitest";
import { shapeDuneResult } from "./dune.js";

describe("shapeDuneResult", () => {
  it("extracts rows and execution timestamp into a DuneResultRef", () => {
    const api = {
      execution_id: "01ABC",
      result: { rows: [{ tvl_usd: 247_500_000 }] },
      execution_ended_at: "2026-06-16T00:00:00Z",
    };
    const ref = shapeDuneResult(42, api);
    expect(ref.queryId).toBe(42);
    expect(ref.rows[0].tvl_usd).toBe(247_500_000);
    expect(ref.executedAt).toBe("2026-06-16T00:00:00Z");
  });
});
