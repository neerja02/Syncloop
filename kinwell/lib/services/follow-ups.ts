import "server-only";
import { getDb } from "@/lib/database/client";
import { assertFamilyAccess, assertProfileAccess } from "@/lib/security/access";
import { appendMessage } from "@/lib/services/conversations";
import type { Actor } from "@/types/domain";
import type { ChatCard } from "@/lib/ai/types";
import { randomUUID } from "node:crypto";

export interface FollowUp {
  id: string;
  family_id: string;
  profile_id: string;
  profile_name: string;
  conversation_id: string | null;
  topic: string;
  speciality: string | null;
  due_at: Date;
  status: "scheduled" | "asked" | "done" | "cancelled";
  outcome: "better" | "same" | "worse" | "new" | null;
  created_at: Date;
  answered_at: Date | null;
}

const SELECT = `select f.*, p.display_name as profile_name from follow_ups f join profiles p on p.id = f.profile_id`;

export async function scheduleFollowUp(actor: Actor, input: { profileId: string; conversationId: string; topic: string; speciality?: string | null; hours: number }) {
  const ref = await assertProfileAccess(actor, input.profileId, "write");
  const db = await getDb();
  // One open check-in per conversation.
  await db.query("update follow_ups set status = 'cancelled' where conversation_id = $1 and status in ('scheduled','asked')", [input.conversationId]);
  const due = new Date(Date.now() + Math.max(1, Math.min(24 * 14, input.hours)) * 3600_000);
  const { rows } = await db.query<{ id: string }>(
    "insert into follow_ups(family_id, profile_id, conversation_id, topic, speciality, due_at, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id",
    [ref.family_id, input.profileId, input.conversationId, input.topic.slice(0, 120), input.speciality ?? null, due, actor.id],
  );
  return { id: rows[0]!.id, dueAt: due };
}

/** Check-ins that are due and not yet answered, for the home screen. */
export async function dueFollowUps(actor: Actor, familyId: string): Promise<FollowUp[]> {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  return (await db.query<FollowUp>(`${SELECT} where f.family_id = $1 and f.status in ('scheduled','asked') and f.due_at <= now() order by f.due_at limit 3`, [familyId])).rows;
}

const questionFor = (f: FollowUp, isSelf: boolean): ChatCard => ({
  id: randomUUID().slice(0, 8),
  type: "question",
  key: "followup_status",
  style: "chips",
  status: "open",
  options: [
    { label: "Better", value: "better" },
    { label: "About the same", value: "same" },
    { label: "Worse", value: "worse" },
    { label: isSelf ? "I have new symptoms" : "New symptoms", value: "new" },
  ],
});

/**
 * When a conversation is opened after its check-in is due, the agent asks "How are you feeling now?" in the
 * conversation itself. Returns true if a message was added.
 */
export async function deliverDueFollowUp(actor: Actor, conversationId: string): Promise<boolean> {
  const db = await getDb();
  const f = (await db.query<FollowUp & { relationship: string }>(`${SELECT.replace("p.display_name as profile_name", "p.display_name as profile_name, p.relationship")} where f.conversation_id = $1 and f.status = 'scheduled' and f.due_at <= now() limit 1`, [conversationId])).rows[0];
  if (!f) return false;
  await assertFamilyAccess(actor, f.family_id, "write");
  const isSelf = f.relationship === "self";
  const since = Math.round((Date.now() - new Date(f.created_at).getTime()) / 3600_000);
  const when = since >= 36 ? `${Math.round(since / 24)} days` : since >= 20 ? "a day" : "a few hours";
  const text = isSelf ? `It's been ${when} since we talked about your ${f.topic}. How are you feeling now?` : `It's been ${when} since we talked about ${f.profile_name}'s ${f.topic}. How is ${f.profile_name} doing now?`;
  await appendMessage(conversationId, { role: "assistant", content: text, cards: [questionFor(f, isSelf)], profileId: f.profile_id });
  await db.query("update follow_ups set status = 'asked' where id = $1", [f.id]);
  await db.query("update conversations set state = jsonb_set(coalesce(state, '{}'::jsonb), '{followUpId}', to_jsonb($2::text)) where id = $1", [conversationId, f.id]);
  return true;
}

export async function getFollowUp(actor: Actor, id: string): Promise<FollowUp | null> {
  const db = await getDb();
  const f = (await db.query<FollowUp>(`${SELECT} where f.id = $1`, [id])).rows[0] ?? null;
  if (f) await assertFamilyAccess(actor, f.family_id);
  return f;
}

export async function recordFollowUpOutcome(actor: Actor, id: string, outcome: FollowUp["outcome"]) {
  const f = await getFollowUp(actor, id);
  if (!f) return null;
  await assertFamilyAccess(actor, f.family_id, "write");
  const db = await getDb();
  await db.query("update follow_ups set status = 'done', outcome = $2, answered_at = now() where id = $1", [id, outcome]);
  return f;
}
