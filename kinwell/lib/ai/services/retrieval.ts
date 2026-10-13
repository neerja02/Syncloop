import "server-only";
import { searchDoctorKnowledge, type RetrievedChunk } from "@/lib/services/knowledge";
import { REFERENCE_TOPICS, REFERENCE_VERSION, type ReferenceTopic } from "@/lib/clinical/reference";
import type { SourceTracker } from "../agents/context";

/**
 * Doctor Knowledge Retrieval Service (PRIORITY 2): RAG over the assigned doctor's approved documents.
 */
export async function retrieveDoctorKnowledge(doctorId: string | null, query: string, tracker: SourceTracker, opts: { k?: number; category?: string } = {}): Promise<RetrievedChunk[]> {
  if (!doctorId) return [];
  tracker.section("doctor_knowledge");
  const chunks = await searchDoctorKnowledge(doctorId, query, { k: opts.k ?? 3, category: opts.category });
  for (const c of chunks) {
    tracker.knowledgeDocuments.set(c.document_id, { document_id: c.document_id, title: c.title, version: c.version, doctor: c.doctor_name });
    tracker.chunks.push({ chunk_id: c.chunk_id, document_id: c.document_id, score: c.score, excerpt: c.content.slice(0, 240) });
  }
  return chunks;
}

/**
 * Clinical Retrieval Service (PRIORITY 4/5): approved reference content, and — when configured —
 * trusted external guideline services. External services are intentionally not called in development.
 */
export function retrieveReference(conceptCodes: string[], tracker: SourceTracker): ReferenceTopic[] {
  const topics = conceptCodes.map((c) => REFERENCE_TOPICS[c]).filter((t): t is ReferenceTopic => !!t);
  if (topics.length) tracker.section(`reference:${REFERENCE_VERSION}`);
  return topics;
}

/** Picks the most useful sentence(s) from a retrieved chunk for display. */
export function excerpt(chunk: RetrievedChunk, query: string, max = 320) {
  const words = new Set(query.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  // Drop heading-only lines, then split into sentences and ignore fragments that start mid-sentence.
  const body = chunk.content
    .split("\n")
    .filter((l) => !(l.trim().length < 60 && !/[.!?:]$/.test(l.trim())))
    .join(" ");
  const sentences = body
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => /^[A-Z0-9"“(]/.test(s.trim()));
  const scored = sentences.map((s, i) => ({ s, i, score: (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w)).length }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const best = scored.slice(0, 2).sort((a, b) => a.i - b.i).map((x) => x.s).join(" ");
  const text = best || chunk.content;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
