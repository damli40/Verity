import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type LlmProvider = "anthropic" | "openai";

export interface CompleteParams {
  model: string;
  prompt: string;
  maxTokens: number;
}

/**
 * Resolve the active provider from the environment. Defaults to "anthropic" so existing
 * behaviour is unchanged; set VERITY_LLM_PROVIDER=openai to test with OpenAI models.
 * Pure (no I/O) so it can be unit-tested.
 */
export function selectedProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  return (env.VERITY_LLM_PROVIDER ?? "anthropic").toLowerCase() === "openai" ? "openai" : "anthropic";
}

/**
 * Provider-agnostic single-shot text completion. The synthesizer and judge build their own
 * prompts and parse their own output; this only abstracts "send a prompt, get text back".
 */
export async function complete({ model, prompt, maxTokens }: CompleteParams): Promise<string> {
  if (selectedProvider() === "openai") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
