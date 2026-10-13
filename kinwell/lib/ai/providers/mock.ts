import { CONCEPTS } from "@/lib/integrations/terminology/clinical";
import type { AIProvider, ChatRequest, EmbeddingProvider, StructuredRequest } from "./types";

/**
 * Development AI provider. It performs no generation: the orchestrator's deterministic agents already produce
 * safe, structured drafts, and with this provider those drafts are shown as-is. Structured requests throw so the
 * caller falls back to its rule-based implementation.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "deterministic-agents-v1";
  readonly isMock = true;
  readonly supportsVision = false;
  async chat(req: ChatRequest) {
    return req.messages.at(-1)?.content ?? "";
  }
  async structuredOutput<T>(_req: StructuredRequest<T>): Promise<T> {
    throw new Error("Mock provider: use rule-based fallback");
  }
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "be", "with", "my", "i", "it", "this", "that", "at", "as", "by", "if", "you", "your", "can", "do", "should", "what", "how", "has", "have", "been"]);

function stem(w: string) {
  return w.replace(/(ings|ing|ies|ied|es|ed|s)$/i, "").slice(0, 12);
}

function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Concept-aware synonym expansion so "sugar" and "glucose" land near each other in the mock vector space. */
function expand(text: string) {
  const lower = text.toLowerCase();
  const extra: string[] = [];
  for (const c of CONCEPTS) {
    if (c.synonyms.some((s) => lower.includes(s))) extra.push(c.code, c.label);
  }
  return `${text} ${extra.join(" ")}`;
}

/**
 * Deterministic feature-hashing embeddings (unigrams + bigrams, signed hashing, L2-normalised).
 * Good enough for local RAG demos; swap EMBEDDING_PROVIDER=openai for production semantic search.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock";
  readonly model = "kinwell-hash-512";
  readonly dimensions = 512;
  readonly isMock = true;
  async embed(texts: string[]) {
    return texts.map((t) => this.embedOne(t));
  }
  private embedOne(text: string) {
    const v = new Array<number>(this.dimensions).fill(0);
    const words = expand(text)
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w && !STOP.has(w))
      .map(stem);
    const feats = [...words, ...words.slice(1).map((w, i) => `${words[i]}_${w}`)];
    for (const f of feats) {
      const h = fnv1a(f);
      v[h % this.dimensions]! += h & 0x80000000 ? -1 : 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}
