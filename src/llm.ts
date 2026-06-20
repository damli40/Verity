import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type LlmProvider = "anthropic" | "openai";

export interface CompleteParams {
  model: string;
  prompt: string;
  maxTokens: number;
}

export interface CompleteResult {
  text: string;
  /** Total input+output tokens actually billed, for real cost transparency (0 if the API omits usage). */
  tokens: number;
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
export async function complete({ model, prompt, maxTokens }: CompleteParams): Promise<CompleteResult> {
  if (selectedProvider() === "openai") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return { text: res.choices[0]?.message?.content ?? "", tokens: res.usage?.total_tokens ?? 0 };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { text, tokens: (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0) };
}
