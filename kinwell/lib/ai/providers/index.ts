import "server-only";
import { env } from "@/lib/config/env";
import { AnthropicProvider } from "./anthropic";
import { MockAIProvider, MockEmbeddingProvider } from "./mock";
import { OpenAIEmbeddingProvider, OpenAIProvider } from "./openai";
import type { AIProvider, EmbeddingProvider } from "./types";

export * from "./types";

let ai: AIProvider | null = null;
let embeddings: EmbeddingProvider | null = null;

/** Selects the LLM from AI_PROVIDER. Missing credentials fall back to the mock provider so the app always runs. */
export function getAIProvider(): AIProvider {
  if (ai) return ai;
  if (env.aiProvider === "anthropic" && env.keys.anthropic) ai = new AnthropicProvider(env.keys.anthropic, env.aiModel);
  else if (env.aiProvider === "openai" && env.keys.openai) ai = new OpenAIProvider(env.keys.openai, env.aiModel);
  else ai = new MockAIProvider();
  return ai;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddings) return embeddings;
  embeddings = env.embeddingProvider === "openai" && env.keys.openai ? new OpenAIEmbeddingProvider(env.keys.openai) : new MockEmbeddingProvider();
  return embeddings;
}
