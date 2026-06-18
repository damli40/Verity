import { describe, it, expect } from "vitest";
import { selectedProvider } from "./llm.js";

describe("selectedProvider", () => {
  it("defaults to anthropic when unset", () => {
    expect(selectedProvider({})).toBe("anthropic");
  });

  it("selects openai when VERITY_LLM_PROVIDER=openai (case-insensitive)", () => {
    expect(selectedProvider({ VERITY_LLM_PROVIDER: "OpenAI" })).toBe("openai");
  });

  it("falls back to anthropic for any other value", () => {
    expect(selectedProvider({ VERITY_LLM_PROVIDER: "gemini" })).toBe("anthropic");
  });
});
