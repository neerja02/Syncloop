import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { AIProvider, ChatRequest, EmbeddingProvider, StructuredRequest } from "./types";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly isMock = false;
  // Images are not sent through this adapter yet; photo review falls back to guided questions.
  readonly supportsVision = false;
  private client: OpenAI;
  constructor(apiKey: string, readonly model: string = "gpt-5") {
    this.client = new OpenAI({ apiKey, timeout: 60_000 });
  }
  async chat(req: ChatRequest) {
    const r = await this.client.responses.create({
      model: this.model,
      instructions: req.system,
      input: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: req.maxTokens ?? 4000,
    });
    return r.output_text.trim();
  }
  async structuredOutput<T>(req: StructuredRequest<T>) {
    const r = await this.client.responses.parse({
      model: this.model,
      instructions: req.system,
      input: req.messages.map((m) => ({ role: m.role, content: m.content })),
      text: { format: zodTextFormat(req.schema as never, req.schemaName) },
    });
    return req.schema.parse(r.output_parsed);
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly isMock = false;
  readonly dimensions = 1536;
  private client: OpenAI;
  constructor(apiKey: string, readonly model = "text-embedding-3-small") {
    this.client = new OpenAI({ apiKey });
  }
  async embed(texts: string[]) {
    const r = await this.client.embeddings.create({ model: this.model, input: texts });
    return r.data.map((d) => d.embedding);
  }
}
