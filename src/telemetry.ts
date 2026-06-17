import { PostHog } from "posthog-node";

export interface RunMetrics {
  passed: boolean;
  gateStage: string;
  confidenceAvg: number;
  costUsd: number;
  latencyMs: number;
}

export interface Sink {
  capture(args: { distinctId?: string; event: string; properties: Record<string, unknown> }): void;
  shutdown(): Promise<void> | void;
}

export function makeTelemetry(sink: Sink) {
  return {
    runCompleted(m: RunMetrics) {
      sink.capture({ distinctId: "verity-agent", event: "verity_run_completed", properties: { ...m } });
    },
    async flush() {
      await sink.shutdown();
    },
  };
}

/** Builds a real PostHog-backed sink, or a no-op sink if no key is configured. */
export function defaultSink(): Sink {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return { capture: () => {}, shutdown: () => {} };
  const client = new PostHog(key, { host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com" });
  return {
    capture: (a) => client.capture({ distinctId: a.distinctId ?? "verity-agent", event: a.event, properties: a.properties }),
    shutdown: () => client.shutdown(),
  };
}
