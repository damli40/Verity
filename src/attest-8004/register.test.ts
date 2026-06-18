import { describe, it, expect } from "vitest";
import { pickAgentId } from "./register.js";

describe("pickAgentId", () => {
  it("returns the agentId from a decoded Registered event", () => {
    expect(pickAgentId([{ args: { agentId: 7n } }])).toBe(7n);
  });

  it("returns the first agentId when multiple events are present", () => {
    expect(pickAgentId([{ args: { agentId: 12n } }, { args: { agentId: 99n } }])).toBe(12n);
  });

  it("throws when no Registered event is found", () => {
    expect(() => pickAgentId([])).toThrow(/no Registered event/i);
  });
});
