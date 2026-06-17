import { describe, it, expect, vi } from "vitest";
import { makeTelemetry } from "./telemetry.js";

describe("makeTelemetry", () => {
  it("captures a run event with the injected sink", () => {
    const sink = { capture: vi.fn(), shutdown: vi.fn() };
    const t = makeTelemetry(sink);
    t.runCompleted({ passed: true, gateStage: "passed", confidenceAvg: 90, costUsd: 0.2, latencyMs: 1234 });
    expect(sink.capture).toHaveBeenCalledOnce();
    const arg = sink.capture.mock.calls[0][0];
    expect(arg.event).toBe("verity_run_completed");
    expect(arg.properties.passed).toBe(true);
  });
});
