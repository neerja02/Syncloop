import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AIRefusalError, type AIProvider, type ChatRequest, type StructuredRequest } from "./types";

/** Puts any images in front of the text of the last user message (the documented base64 image block). */
function withImages(req: ChatRequest): Anthropic.MessageParam[] {
  if (!req.images?.length) return req.messages;
  const last = req.messages.length - 1;
  return req.messages.map((m, i) =>
    i === last && m.role === "user"
      ? { role: "user" as const, content: [...req.images!.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.data } })), { type: "text" as const, text: m.content }] }
      : m,
  );
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/**
 * Anthropic Claude adapter (official SDK).
 * - chat(): server-side refusal fallbacks are enabled ("default" routing), so a policy decline is re-run on a
 *   fallback model inside the same call; we still check stop_reason before reading content.
 * - structuredOutput(): uses output_config.format with a Zod schema, then re-validates with Zod.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly isMock = false;
  readonly supportsVision = true;
  private client: Anthropic;
  constructor(apiKey: string, readonly model: string = DEFAULT_ANTHROPIC_MODEL) {
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  }

  async chat(req: ChatRequest): Promise<string> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 4000,
      system: req.system,
      messages: withImages(req),
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") throw new AIRefusalError();
    return response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  async structuredOutput<T>(req: StructuredRequest<T>): Promise<T> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: req.maxTokens ?? 4000,
      system: req.system,
      messages: withImages(req),
      output_config: { effort: "low", format: zodOutputFormat(req.schema as never) },
    });
    if (response.stop_reason === "refusal") throw new AIRefusalError();
    return req.schema.parse(response.parsed_output);
  }
}
