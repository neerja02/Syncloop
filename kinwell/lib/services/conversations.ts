import "server-only";
import { getDb } from "@/lib/database/client";
import { assertFamilyAccess, assertProfileAccess, ForbiddenError, NotFoundError } from "@/lib/security/access";
import type { Actor, Urgency } from "@/types/domain";
import type { ChatCard } from "@/lib/ai/types";

export interface Conversation {
  id: string;
  family_id: string;
  active_profile_id: string;
  active_profile_name: string;
  mentioned_profile_id: string | null;
  profile_confidence: number | null;
  title: string;
  state: ConversationState;
  last_message_at: Date;
  created_at: Date;
}

/** Short-lived conversational memory (slot filling, pending confirmations). Not part of the medical record. */
export interface ConversationState {
  pending?: {
    kind: "glucose" | "blood_pressure";
    value?: number | null;
    secondaryValue?: number | null;
    context?: string | null;
    minutesAfterMeal?: number | null;
    askedDiabetes?: boolean;
  } | null;
  symptomFlow?: { concepts: string[]; asked: string[]; answers: Record<string, string> } | null;
  pendingProfileSwitch?: { profileId: string; name: string; originalMessage: string } | null;
  lastIntent?: string;
  /** The check-in currently asked in this conversation ("How are you feeling now?"). */
  followUpId?: string | null;
  /** Structured state of a tap-to-answer guided flow (symptom check, test result, report, question). */
  guided?: import("@/lib/ai/guided/types").GuidedState | null;
  /** False once the user renames the chat; until then titles are generated from the conversation. */
  autoTitle?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  profile_id: string | null;
  role: "user" | "assistant" | "doctor" | "system";
  content: string;
  cards: ChatCard[];
  urgency: Urgency | null;
  answer_id: string | null;
  created_at: Date;
}

const CONV_SELECT = `select c.*, p.display_name as active_profile_name from conversations c join profiles p on p.id = c.active_profile_id`;

export async function listConversations(actor: Actor, familyId: string, opts: { q?: string; limit?: number; profileId?: string } = {}) {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  const args: unknown[] = [familyId];
  let where = "c.family_id = $1 and not c.archived";
  if (opts.profileId) {
    args.push(opts.profileId);
    where += ` and c.active_profile_id = $${args.length}`;
  }
  if (opts.q) {
    args.push(`%${opts.q}%`);
    args.push(opts.q);
    where += ` and (c.title ilike $${args.length - 1} or exists (select 1 from messages m where m.conversation_id = c.id and (m.search @@ plainto_tsquery('english', $${args.length}) or m.content ilike $${args.length - 1})))`;
  }
  args.push(opts.limit ?? 60);
  return (await db.query<Conversation>(`${CONV_SELECT} where ${where} order by c.last_message_at desc limit $${args.length}`, args)).rows;
}

export async function getConversation(actor: Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError("Conversation not found");
  const db = await getDb();
  const conv = (await db.query<Conversation>(`${CONV_SELECT} where c.id = $1`, [id])).rows[0];
  if (!conv) throw new NotFoundError("Conversation not found");
  await assertFamilyAccess(actor, conv.family_id);
  const messages = (await db.query<Message>("select id, conversation_id, profile_id, role, content, cards, urgency, answer_id, created_at from messages where conversation_id = $1 order by created_at, id", [id])).rows;
  return { conversation: conv, messages };
}

export async function createConversation(actor: Actor, profileId: string, title = "New health chat") {
  const ref = await assertProfileAccess(actor, profileId, "write");
  const db = await getDb();
  const { rows } = await db.query<{ id: string }>("insert into conversations(family_id, created_by, active_profile_id, title) values ($1,$2,$3,$4) returning id", [ref.family_id, actor.id, profileId, title.slice(0, 80)]);
  return rows[0]!.id;
}

/** Switching the subject of a conversation. Stored so every later message is attributed to the right person. */
export async function setActiveProfile(actor: Actor, conversationId: string, profileId: string, confidence = 1) {
  const { conversation } = await getConversation(actor, conversationId);
  const ref = await assertProfileAccess(actor, profileId, "write");
  if (ref.family_id !== conversation.family_id) throw new ForbiddenError();
  const db = await getDb();
  await db.query(
    "update conversations set active_profile_id = $2, mentioned_profile_id = $2, profile_confidence = $3, state = state - 'pendingProfileSwitch' - 'pending' - 'symptomFlow', updated_at = now() where id = $1",
    [conversationId, profileId, confidence],
  );
  await appendMessage(conversationId, { role: "system", content: `Now talking about ${ref.display_name}.`, profileId });
}

export async function updateConversationState(conversationId: string, state: ConversationState, extra: { mentionedProfileId?: string | null; profileConfidence?: number | null; title?: string } = {}) {
  const db = await getDb();
  await db.query(
    `update conversations set state = $2::jsonb, mentioned_profile_id = coalesce($3, mentioned_profile_id), profile_confidence = coalesce($4, profile_confidence),
     title = coalesce($5, title), updated_at = now() where id = $1`,
    [conversationId, JSON.stringify(state), extra.mentionedProfileId ?? null, extra.profileConfidence ?? null, extra.title ?? null],
  );
}

export async function appendMessage(
  conversationId: string,
  m: { role: Message["role"]; content: string; cards?: ChatCard[]; profileId?: string | null; urgency?: Urgency | null; answerId?: string | null; authorUserId?: string | null },
) {
  const db = await getDb();
  const { rows } = await db.query<Message>(
    "insert into messages(conversation_id, profile_id, role, content, cards, urgency, answer_id, author_user_id) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8) returning id, conversation_id, profile_id, role, content, cards, urgency, answer_id, created_at",
    [conversationId, m.profileId ?? null, m.role, m.content, JSON.stringify(m.cards ?? []), m.urgency ?? null, m.answerId ?? null, m.authorUserId ?? null],
  );
  await db.query("update conversations set last_message_at = now() where id = $1", [conversationId]);
  return rows[0]!;
}

export async function renameConversation(actor: Actor, id: string, title: string) {
  const { conversation } = await getConversation(actor, id);
  await assertFamilyAccess(actor, conversation.family_id, "write");
  const db = await getDb();
  await db.query("update conversations set title = $2 where id = $1", [id, title.trim().slice(0, 80) || "Health chat"]);
}

export async function deleteConversation(actor: Actor, id: string) {
  const { conversation } = await getConversation(actor, id);
  await assertFamilyAccess(actor, conversation.family_id, "write");
  const db = await getDb();
  await db.query("delete from conversations where id = $1", [id]);
}

/** Updates a card inside a stored message (e.g. "Save reading" → saved) so the UI reflects decisions. */
export async function updateMessageCard(actor: Actor, messageId: string, cardId: string, patch: Record<string, unknown>) {
  const db = await getDb();
  const row = (await db.query<{ cards: ChatCard[]; family_id: string }>("select m.cards, c.family_id from messages m join conversations c on c.id = m.conversation_id where m.id = $1", [messageId])).rows[0];
  if (!row) throw new NotFoundError();
  await assertFamilyAccess(actor, row.family_id, "write");
  const cards = row.cards.map((c) => (c.id === cardId ? ({ ...c, ...patch } as ChatCard) : c));
  await db.query("update messages set cards = $2::jsonb where id = $1", [messageId, JSON.stringify(cards)]);
}
