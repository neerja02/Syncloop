import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/database/client";
import { assertDoctor, ForbiddenError, logAccess, NotFoundError } from "@/lib/security/access";
import { getStorage } from "@/lib/integrations/storage";
import { getDocumentRecognition } from "@/lib/integrations/ocr";
import { getEmbeddingProvider } from "@/lib/ai/providers";
import { getClinicalTerminology } from "@/lib/integrations/terminology/clinical";
import type { Actor } from "@/types/domain";

export const KNOWLEDGE_CATEGORIES = ["Diabetes", "Blood Pressure", "Fever", "Cold & Flu", "Paediatrics", "Heart", "Nutrition", "Exercise", "Sleep", "Medication Guides", "General"] as const;

export interface KnowledgeDocument {
  id: string;
  doctor_id: string;
  title: string;
  category: string;
  document_type: string;
  version: number;
  source: string | null;
  uploaded_at: Date;
  reviewed_at: Date | null;
  status: string;
  active: boolean;
  embedding_status: string;
  chunk_count: number;
  error: string | null;
  parsed_content: string | null;
  original_file_url: string | null;
  mime_type: string | null;
  is_demo: boolean;
}

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  title: string;
  category: string;
  version: number;
  chunk_index: number;
  content: string;
  score: number;
  doctor_id: string;
  doctor_name: string;
}

const MIME_TO_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "image/jpeg": "image",
  "image/png": "image",
};

/** Splits text into overlapping chunks, carrying the nearest heading so each chunk keeps its context. */
export function chunkText(text: string, size = 900, overlap = 150): { content: string; heading: string | null }[] {
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n\s*\n|\n(?=#{1,6}\s)|\n(?=[A-Z][A-Za-z &/-]{2,60}:?\n)/)
    .map((p) => p.trim())
    .filter(Boolean)
    // Long paragraphs are pre-split at sentence boundaries so chunks never start mid-sentence.
    .flatMap((p) => {
      if (p.length <= size) return [p];
      const groups: string[] = [];
      let g = "";
      for (const sentence of p.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)) {
        if (g && (g + " " + sentence).length > size) {
          groups.push(g);
          g = sentence;
        } else g = g ? g + " " + sentence : sentence;
      }
      if (g) groups.push(g);
      return groups;
    });
  const chunks: { content: string; heading: string | null }[] = [];
  let current = "";
  let heading: string | null = null;
  let currentHeading: string | null = null;
  const flush = () => {
    if (current.trim()) chunks.push({ content: current.trim(), heading: currentHeading });
  };
  for (const p of paragraphs) {
    const firstLine = p.split("\n")[0]!;
    if (/^#{1,6}\s/.test(firstLine) || (firstLine.length < 70 && /^[A-Z]/.test(firstLine) && !/[.!?]$/.test(firstLine) && p.split("\n").length > 1)) {
      heading = firstLine.replace(/^#+\s*/, "");
    }
    if ((current + "\n\n" + p).length > size && current) {
      flush();
      // Overlap with the last full sentence(s) of the previous chunk so no chunk starts mid-sentence.
      const sentences = current.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
      let tail = "";
      for (let i = sentences.length - 1; i >= 0 && (tail.length + sentences[i]!.length) < overlap; i--) tail = sentences[i] + (tail ? " " + tail : "");
      current = (tail ? tail + "\n\n" : "") + p;
      currentHeading = heading;
    } else {
      current = current ? current + "\n\n" + p : p;
      currentHeading ??= heading;
    }
    while (current.length > size * 1.6) {
      chunks.push({ content: current.slice(0, size).trim(), heading: currentHeading });
      current = current.slice(size - overlap);
    }
  }
  flush();
  return chunks;
}

const toVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;

export async function listKnowledgeDocuments(actor: Actor, filters: { category?: string; status?: string; q?: string } = {}) {
  assertDoctor(actor);
  const db = await getDb();
  const args: unknown[] = [actor.doctorId];
  const where = ["doctor_id = $1"];
  if (filters.category) {
    args.push(filters.category);
    where.push(`category = $${args.length}`);
  }
  if (filters.status) {
    args.push(filters.status);
    where.push(`status = $${args.length}`);
  }
  if (filters.q) {
    args.push(`%${filters.q}%`);
    where.push(`(title ilike $${args.length} or parsed_content ilike $${args.length})`);
  }
  return (await db.query<KnowledgeDocument>(`select * from knowledge_documents where ${where.join(" and ")} order by updated_at desc`, args)).rows;
}

export async function getKnowledgeDocument(actor: Actor, id: string) {
  assertDoctor(actor);
  const db = await getDb();
  const doc = (await db.query<KnowledgeDocument>("select * from knowledge_documents where id = $1", [id])).rows[0];
  if (!doc) throw new NotFoundError("Document not found");
  if (doc.doctor_id !== actor.doctorId) throw new ForbiddenError();
  const chunks = (await db.query<{ id: string; chunk_index: number; content: string; token_count: number; metadata: Record<string, unknown> }>("select id, chunk_index, content, token_count, metadata from knowledge_chunks where document_id = $1 order by chunk_index", [id])).rows;
  return { doc, chunks };
}

export async function uploadKnowledgeDocument(
  actor: Actor,
  input: { title: string; category: string; source?: string | null; file?: { name: string; type: string; buffer: Buffer }; text?: string; replacesId?: string | null },
) {
  assertDoctor(actor);
  const title = input.title.trim().slice(0, 160);
  if (!title) throw new Error("Add a title for this document.");
  if (!KNOWLEDGE_CATEGORIES.includes(input.category as (typeof KNOWLEDGE_CATEGORIES)[number])) throw new Error("Choose a category.");
  const db = await getDb();
  const id = randomUUID();
  let storageKey: string | null = null;
  let mime = "text/plain";
  let docType = "note";
  let version = 1;
  if (input.replacesId) {
    const prev = (await db.query<{ doctor_id: string; version: number }>("select doctor_id, version from knowledge_documents where id = $1", [input.replacesId])).rows[0];
    if (!prev || prev.doctor_id !== actor.doctorId) throw new ForbiddenError();
    version = prev.version + 1;
  }
  if (input.file) {
    mime = input.file.type || "application/octet-stream";
    if (/\.docx$/i.test(input.file.name)) mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (/\.txt$/i.test(input.file.name)) mime = "text/plain";
    docType = MIME_TO_TYPE[mime] ?? "";
    if (!docType) throw new Error("Upload a PDF, DOCX, TXT, JPG or PNG file.");
    if (input.file.buffer.length > 25 * 1024 * 1024) throw new Error("Files must be 25 MB or smaller.");
    storageKey = `doctors/${actor.doctorId}/knowledge/${id}/${input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)}`;
    await getStorage().put(storageKey, input.file.buffer, mime);
  } else if (!input.text?.trim()) {
    throw new Error("Upload a file or paste the guidance text.");
  }
  await db.query(
    `insert into knowledge_documents(id, doctor_id, title, category, document_type, version, source, status, original_file_url, mime_type)
     values ($1,$2,$3,$4,$5,$6,$7,'processing',$8,$9)`,
    [id, actor.doctorId, title, input.category, docType, version, input.source ?? null, storageKey, mime],
  );
  await logAccess(actor, "upload", "knowledge_document", id, null);
  await processKnowledgeDocument(id, input.file ? { buffer: input.file.buffer, mime, filename: input.file.name } : { text: input.text! });
  if (input.replacesId) {
    await db.query("update knowledge_documents set status = 'archived', active = false, updated_at = now() where id = $1", [input.replacesId]);
  }
  return id;
}

export async function processKnowledgeDocument(id: string, source: { buffer: Buffer; mime: string; filename: string } | { text: string }) {
  const db = await getDb();
  const doc = (await db.query<{ doctor_id: string; title: string; category: string }>("select doctor_id, title, category from knowledge_documents where id = $1", [id])).rows[0]!;
  try {
    let text: string;
    let isMockOcr = false;
    if ("text" in source) text = source.text;
    else {
      const rec = await getDocumentRecognition().recognize({ buffer: source.buffer, mimeType: source.mime, filename: source.filename });
      text = rec.text;
      isMockOcr = rec.isMock;
      if (isMockOcr) throw new Error("Scanned pages need an OCR provider. Configure OCR_PROVIDER, or paste the text instead.");
    }
    text = text.replace(/\u0000/g, "").trim();
    if (text.length < 40) throw new Error("We couldn't find readable text in this document.");
    const chunks = chunkText(text);
    const embedder = getEmbeddingProvider();
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += 64) {
      vectors.push(...(await embedder.embed(chunks.slice(i, i + 64).map((c) => `${doc.title}. ${c.heading ?? ""}. ${c.content}`))));
    }
    await db.transaction(async (tx) => {
      await tx.query("delete from knowledge_chunks where document_id = $1", [id]);
      for (let i = 0; i < chunks.length; i++) {
        await tx.query(
          "insert into knowledge_chunks(document_id, doctor_id, chunk_index, content, embedding, embedding_model, token_count, metadata) values ($1,$2,$3,$4,$5::vector,$6,$7,$8::jsonb)",
          [id, doc.doctor_id, i, chunks[i]!.content, toVector(vectors[i]!), embedder.model, Math.ceil(chunks[i]!.content.length / 4), JSON.stringify({ heading: chunks[i]!.heading, category: doc.category })],
        );
      }
      await tx.query(
        "update knowledge_documents set parsed_content = $2, status = 'ready_for_review', embedding_status = 'complete', chunk_count = $3, error = null, updated_at = now() where id = $1",
        [id, text.slice(0, 200000), chunks.length],
      );
    });
  } catch (e) {
    await db.query("update knowledge_documents set status = 'failed', embedding_status = 'failed', error = $2, updated_at = now() where id = $1", [id, e instanceof Error ? e.message : "Processing failed"]);
  }
}

/** Only approved + active documents are ever retrieved for patients. */
export async function setKnowledgeStatus(actor: Actor, id: string, action: "approve" | "deactivate" | "archive" | "reactivate") {
  assertDoctor(actor);
  const db = await getDb();
  const doc = (await db.query<{ doctor_id: string; status: string }>("select doctor_id, status from knowledge_documents where id = $1", [id])).rows[0];
  if (!doc) throw new NotFoundError();
  if (doc.doctor_id !== actor.doctorId) throw new ForbiddenError();
  if (action === "approve" || action === "reactivate") {
    if (!["ready_for_review", "approved"].includes(doc.status)) throw new Error("Only processed documents can be approved.");
    await db.query("update knowledge_documents set status = 'approved', active = true, reviewed_at = now(), reviewed_by = $2, updated_at = now() where id = $1", [id, actor.doctorId]);
  } else if (action === "deactivate") {
    await db.query("update knowledge_documents set active = false, updated_at = now() where id = $1", [id]);
  } else {
    await db.query("update knowledge_documents set status = 'archived', active = false, updated_at = now() where id = $1", [id]);
  }
  await logAccess(actor, `knowledge_${action}`, "knowledge_document", id, null);
}

export async function deleteKnowledgeDocument(actor: Actor, id: string) {
  assertDoctor(actor);
  const db = await getDb();
  const doc = (await db.query<{ doctor_id: string; original_file_url: string | null }>("select doctor_id, original_file_url from knowledge_documents where id = $1", [id])).rows[0];
  if (!doc) return;
  if (doc.doctor_id !== actor.doctorId) throw new ForbiddenError();
  if (doc.original_file_url) await getStorage().delete(doc.original_file_url).catch(() => {});
  await db.query("delete from knowledge_documents where id = $1", [id]);
}

/**
 * Doctor Knowledge Retrieval (RAG). Hybrid ranking: vector similarity on the doctor's approved chunks plus
 * Postgres full-text rank. Only the assigned doctor's approved, active documents are searched.
 */
export async function searchDoctorKnowledge(doctorId: string, query: string, opts: { k?: number; minScore?: number; category?: string } = {}): Promise<RetrievedChunk[]> {
  const db = await getDb();
  const expanded = await getClinicalTerminology().expandQuery(query);
  const embedder = getEmbeddingProvider();
  const [qv] = await embedder.embed([expanded]);
  const orQuery =
    [...new Set(expanded.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [])]
      .filter((w) => !["the", "and", "for", "with", "what", "how", "can", "should", "about", "this", "that", "have", "has", "was", "are", "you", "your", "my"].includes(w))
      .slice(0, 40)
      .join(" | ") || "none";
  const args: unknown[] = [doctorId, toVector(qv!), embedder.model, orQuery];
  let catFilter = "";
  if (opts.category) {
    args.push(opts.category);
    catFilter = `and d.category = $${args.length}`;
  }
  const { rows } = await db.query<RetrievedChunk & { vec: number; text_rank: number }>(
    `select c.id as chunk_id, c.document_id, d.title, d.category, d.version, c.chunk_index, c.content, d.doctor_id, doc.full_name as doctor_name,
            1 - (c.embedding <=> $2::vector) as vec,
            ts_rank(c.search, to_tsquery('english', $4)) as text_rank
     from knowledge_chunks c
     join knowledge_documents d on d.id = c.document_id
     join doctors doc on doc.id = d.doctor_id
     where c.doctor_id = $1 and d.status = 'approved' and d.active and c.embedding_model = $3 ${catFilter}
     order by c.embedding <=> $2::vector
     limit 40`,
    args,
  );
  const scored = rows
    .map((r) => ({ ...r, score: Math.round((0.75 * r.vec + 0.25 * Math.min(1, r.text_rank * 4)) * 1000) / 1000 }))
    .filter((r) => r.score >= (opts.minScore ?? (embedder.isMock ? 0.12 : 0.3)))
    .sort((a, b) => b.score - a.score);
  // One best chunk per document first, then fill.
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  for (const r of scored) {
    if (seen.has(r.document_id)) continue;
    seen.add(r.document_id);
    out.push(strip(r));
  }
  for (const r of scored) {
    if (out.length >= (opts.k ?? 4)) break;
    if (!out.some((o) => o.chunk_id === r.chunk_id)) out.push(strip(r));
  }
  return out.slice(0, opts.k ?? 4);
}

function strip(r: RetrievedChunk & { vec: number; text_rank: number }): RetrievedChunk {
  const { vec: _v, text_rank: _t, ...rest } = r;
  return rest;
}

export async function knowledgeStats(doctorId: string) {
  const db = await getDb();
  return (
    await db.query<{ total: number; approved: number; pending: number; failed: number; chunks: number }>(
      `select count(*) as total, count(*) filter (where status = 'approved' and active) as approved,
       count(*) filter (where status = 'ready_for_review') as pending, count(*) filter (where status = 'failed') as failed,
       coalesce(sum(chunk_count) filter (where status = 'approved' and active), 0)::int as chunks
       from knowledge_documents where doctor_id = $1`,
      [doctorId],
    )
  ).rows[0]!;
}
