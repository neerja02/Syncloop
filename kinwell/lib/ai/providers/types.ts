import type { z } from "zod";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** A base64 image attached to the last user message (vision). Downscale before sending. */
export interface ChatImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  images?: ChatImage[];
}

export interface StructuredRequest<T> extends ChatRequest {
  schema: z.ZodType<T>;
  schemaName: string;
}

/** Vendor-neutral LLM interface. Business code depends only on this. */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  readonly isMock: boolean;
  /** Whether images in requests are actually looked at (vision). */
  readonly supportsVision: boolean;
  chat(req: ChatRequest): Promise<string>;
  structuredOutput<T>(req: StructuredRequest<T>): Promise<T>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  readonly isMock: boolean;
  embed(texts: string[]): Promise<number[][]>;
}

export class AIRefusalError extends Error {
  constructor(message = "The AI provider declined this request") {
    super(message);
    this.name = "AIRefusalError";
  }
}
