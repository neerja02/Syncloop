import { beforeAll, describe, expect, it, afterAll } from "vitest";
import { uploadKnowledgeDocument, setKnowledgeStatus, searchDoctorKnowledge, chunkText, getKnowledgeDocument } from "@/lib/services/knowledge";
import { createConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import { ForbiddenError } from "@/lib/security/access";
import { createWorld, type TestWorld } from "./helpers";

// These tests cover the doctor portal, which is switched off in the patient-only MVP.
beforeAll(() => {
  process.env.ENABLE_DOCTOR_PORTAL = "true";
});
afterAll(() => {
  delete process.env.ENABLE_DOCTOR_PORTAL;
});

let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});

const GUIDE = `# Gout flare plan (test)
Uric acid and gout
When a gout flare starts, rest the joint, apply an ice pack for 20 minutes, drink plenty of water and avoid alcohol and red meat for a week. Contact the clinic if the joint is very hot with fever.`;

describe("doctor knowledge RAG", () => {
  it("chunks documents without starting mid-sentence", () => {
    const chunks = chunkText(Array.from({ length: 30 }, (_, i) => `Sentence number ${i} explains something useful about care.`).join(" "), 300, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks.slice(1)) expect(c.content[0]).toMatch(/[A-Z]/);
  });
  it("a new document is not used until the doctor approves it", async () => {
    const id = await uploadKnowledgeDocument(w.doctor, { title: "Gout flare plan", category: "General", text: GUIDE });
    const { doc } = await getKnowledgeDocument(w.doctor, id);
    expect(doc.status).toBe("ready_for_review");
    expect(doc.chunk_count).toBeGreaterThan(0);
    expect((await searchDoctorKnowledge(w.doctor.doctorId, "gout flare ice pack")).some((c) => c.document_id === id)).toBe(false);
    await setKnowledgeStatus(w.doctor, id, "approve");
    const hits = await searchDoctorKnowledge(w.doctor.doctorId, "what should I do for a gout flare in my toe");
    expect(hits[0]?.document_id).toBe(id);
  });
  it("other doctors cannot read or retrieve the document", async () => {
    const docs = await w.db.query<{ id: string }>("select id from knowledge_documents where doctor_id = $1 limit 1", [w.doctor.doctorId]);
    await expect(getKnowledgeDocument(w.doctor2, docs.rows[0]!.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await searchDoctorKnowledge(w.doctor2.doctorId, "gout flare ice pack")).toHaveLength(0);
  });
  it("patients asking a related question get the assigned doctor's guidance, and the audit log records it", async () => {
    const conv = await createConversation(w.demo, w.profiles.dad);
    const turn = await handleUserMessage(w.demo, conv, "What does my doctor recommend for a gout flare?");
    const guidance = turn.assistantMessage.cards.find((c) => c.type === "doctor_guidance") as { items: { title: string }[] } | undefined;
    expect(guidance?.items.some((i) => /Gout/.test(i.title))).toBe(true);
    const log = (await w.db.query<{ knowledge_documents_used: { title: string }[] }>("select knowledge_documents_used from agent_audit_logs where answer_id = $1", [turn.assistantMessage.answer_id])).rows[0]!;
    expect(log.knowledge_documents_used.some((d) => /Gout/.test(d.title))).toBe(true);
  });
  it("families of other doctors never see this doctor's guidance", async () => {
    const conv = await createConversation(w.rivera, w.profiles.carlos);
    const turn = await handleUserMessage(w.rivera, conv, "What does my doctor recommend for a gout flare?");
    const guidance = turn.assistantMessage.cards.find((c) => c.type === "doctor_guidance") as { items: { title: string }[] } | undefined;
    expect(guidance?.items.some((i) => /Gout/.test(i.title)) ?? false).toBe(false);
  });
  it("doctor guidance is retrieved for a glucose question", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    await handleUserMessage(w.demo, conv, "My sugar was 196 after lunch");
    const turn = await handleUserMessage(w.demo, conv, "About 2 hours");
    const card = turn.assistantMessage.cards.find((c) => c.type === "measurement_result") as { doctorGuidance: { source: string }[] } | undefined;
    expect(card?.doctorGuidance.length).toBeGreaterThan(0);
    expect(card?.doctorGuidance.some((g) => /Dr\. A\. Sharma/.test(g.source))).toBe(true);
  });
});
