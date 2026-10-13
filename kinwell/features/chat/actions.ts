"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { run } from "@/lib/server/action";
import { handleUserMessage, resolveProfileSwitch } from "@/lib/ai/orchestrator";
import { createConversation, deleteConversation, getConversation, renameConversation, setActiveProfile, updateMessageCard, type Message } from "@/lib/services/conversations";
import { addMeasurement, addAllergy, addCondition, saveMedication } from "@/lib/services/health-record";
import { assertProfileAccess } from "@/lib/security/access";
import { getDb } from "@/lib/database/client";
import type { ChatCard } from "@/lib/ai/types";
import { z } from "zod";

export interface ChatAnswer {
  key: string;
  value: string;
}

const answerSchema = z.object({ key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/), value: z.string().max(400) }).optional();

export async function startConversationAction(profileId: string, firstMessage: string, answer?: ChatAnswer) {
  return run(async (actor) => {
    await assertProfileAccess(actor, profileId, "write");
    const a = answerSchema.parse(answer);
    const id = await createConversation(actor, profileId);
    const turn = await handleUserMessage(actor, id, firstMessage, { answer: a ? { ...a, label: firstMessage } : undefined });
    revalidatePath("/app", "layout");
    return { conversationId: id, messages: [turn.userMessage, turn.assistantMessage].filter(Boolean) as Message[] };
  });
}

export async function sendMessageAction(conversationId: string, text: string, answer?: ChatAnswer) {
  return run(async (actor) => {
    const a = answerSchema.parse(answer);
    const turn = await handleUserMessage(actor, conversationId, text, { answer: a ? { ...a, label: text } : undefined });
    revalidatePath("/app", "layout");
    return { messages: [turn.userMessage, turn.assistantMessage].filter(Boolean) as Message[] };
  });
}

export async function resolveProfileSwitchAction(conversationId: string, messageId: string, cardId: string, decision: "switch" | "keep") {
  return run(async (actor) => {
    await resolveProfileSwitch(actor, conversationId, messageId, cardId, decision);
    revalidatePath("/app", "layout");
    return (await getConversation(actor, conversationId)).messages;
  });
}

export async function changeConversationProfileAction(conversationId: string, profileId: string) {
  return run(async (actor) => {
    await setActiveProfile(actor, conversationId, profileId);
    (await cookies()).set("kw_profile", profileId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
    revalidatePath("/app", "layout");
    return (await getConversation(actor, conversationId)).messages;
  });
}

/** Confirms a "record proposal" card — only now is anything written to the permanent record. */
export async function confirmRecordProposalAction(messageId: string, cardId: string, decision: "save" | "dismiss") {
  return run(async (actor) => {
    const db = await getDb();
    const row = (await db.query<{ cards: ChatCard[]; conversation_id: string; family_id: string }>("select m.cards, m.conversation_id, c.family_id from messages m join conversations c on c.id = m.conversation_id where m.id = $1", [messageId])).rows[0];
    if (!row) throw new Error("Message not found");
    const { assertFamilyAccess } = await import("@/lib/security/access");
    await assertFamilyAccess(actor, row.family_id, "write");
    const card = row.cards.find((c) => c.type === "record_proposal" && c.id === cardId) as Extract<ChatCard, { type: "record_proposal" }> | undefined;
    if (!card) throw new Error("This suggestion is no longer available.");
    if (card.status !== "pending") return card.status;
    if (decision === "save") {
      const p = card.payload;
      if (card.kind === "measurement") await addMeasurement(actor, { ...p, profileId: card.profileId });
      else if (card.kind === "medication") {
        const r = await saveMedication(actor, { ...p, profileId: card.profileId, nameConfirmed: true });
        if (r.status !== "saved") throw new Error("Please confirm the medicine name first.");
      } else if (card.kind === "condition") await addCondition(actor, { profileId: card.profileId, name: String(p.name) }, "chat");
      else if (card.kind === "allergy") await addAllergy(actor, { profileId: card.profileId, substance: String(p.substance) });
      else if (card.kind === "symptom") {
        await assertProfileAccess(actor, card.profileId, "write");
        await db.query("insert into symptoms(profile_id, conversation_id, description, concept_codes) values ($1,$2,$3,$4)", [card.profileId, row.conversation_id, String(p.description), (p.concepts as string[]) ?? []]);
      }
    }
    await updateMessageCard(actor, messageId, cardId, { status: decision === "save" ? "saved" : "dismissed" });
    revalidatePath("/", "layout");
    return decision === "save" ? "saved" : "dismissed";
  });
}

export async function updateCardStatusAction(messageId: string, cardId: string, patch: Record<string, unknown>) {
  return run(async (actor) => updateMessageCard(actor, messageId, cardId, patch));
}

export async function renameConversationAction(id: string, title: string) {
  return run(async (actor) => {
    await renameConversation(actor, id, title);
    revalidatePath("/app", "layout");
  });
}

export async function deleteConversationAction(id: string) {
  return run(async (actor) => {
    await deleteConversation(actor, id);
    revalidatePath("/app", "layout");
  });
}

export async function answerSourcesAction(answerId: string) {
  return run(async (actor) => {
    const db = await getDb();
    const log = (await db.query<{ family_id: string; agent: string; model: string; provider: string; knowledge_documents_used: unknown[]; retrieved_chunks: unknown[]; clinical_rules_used: unknown[]; medications_referenced: unknown[]; doctor_instructions_used: unknown[]; context_sections: string[]; created_at: Date }>("select * from agent_audit_logs where answer_id = $1", [answerId])).rows[0];
    if (!log) throw new Error("No audit record for this answer.");
    const { assertFamilyAccess } = await import("@/lib/security/access");
    await assertFamilyAccess(actor, log.family_id);
    return log;
  });
}
