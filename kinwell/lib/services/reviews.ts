import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/database/client";
import { assertDoctor, assertFamilyAccess, assertProfileAccess, ForbiddenError, logAccess, NotFoundError } from "@/lib/security/access";
import { notify, notifyFamily } from "./notifications";
import type { Actor } from "@/types/domain";

export const reviewRequestSchema = z.object({
  profileId: z.string().uuid(),
  conversationId: z.string().uuid().optional().nullable(),
  messageId: z.string().uuid().optional().nullable(),
  question: z.string().trim().min(5, "Add a short question for your doctor").max(2000),
  priority: z.enum(["routine", "soon", "urgent"]).default("routine"),
});

export const reviewActionSchema = z.object({
  reviewId: z.string().uuid(),
  action: z.enum(["start", "respond", "approve", "request_info", "schedule", "close"]),
  response: z.string().trim().max(5000).optional().nullable(),
  addToRecord: z.coerce.boolean().default(true),
});

export interface DoctorReview {
  id: string;
  family_id: string;
  family_name: string;
  profile_id: string;
  profile_name: string;
  doctor_id: string;
  doctor_name: string;
  conversation_id: string | null;
  message_id: string | null;
  answer_id: string | null;
  summary: string;
  symptoms: { label: string }[];
  measurements: { type: string; value: number; secondary_value: number | null; unit: string; context: string | null; measured_at: string }[];
  reports: { id: string; title: string; date: string | null }[];
  ai_response: string | null;
  knowledge_sources: { title: string; document_id: string }[];
  question: string;
  priority: string;
  status: string;
  doctor_response: string | null;
  approved_ai_response: boolean | null;
  responded_at: Date | null;
  created_at: Date;
}

const REVIEW_SELECT = `select r.*, f.name as family_name, p.display_name as profile_name, d.full_name as doctor_name
  from doctor_reviews r join families f on f.id = r.family_id join profiles p on p.id = r.profile_id join doctors d on d.id = r.doctor_id`;

/**
 * Creates a structured case for the family's dedicated doctor. Snapshot includes recent measurements,
 * reports, the AI answer and the knowledge sources it used, so the doctor sees exactly what the patient saw.
 */
export async function createReview(actor: Actor, raw: unknown) {
  const input = reviewRequestSchema.parse(raw);
  const ref = await assertProfileAccess(actor, input.profileId, "write");
  const db = await getDb();
  const assignment = (await db.query<{ doctor_id: string; accepting_reviews: boolean; user_id: string; email: string }>(
    `select a.doctor_id, d.accepting_reviews, d.user_id, u.email from doctor_family_assignments a join doctors d on d.id = a.doctor_id join users u on u.id = d.user_id
     where a.family_id = $1 and a.status = 'active'`,
    [ref.family_id],
  )).rows[0];
  if (!assignment) throw new Error("Your family doesn't have an assigned doctor yet. Choose one under Doctor.");
  if (!assignment.accepting_reviews) throw new Error("Your doctor is currently unavailable for direct review.");

  let aiResponse: string | null = null;
  let answerId: string | null = null;
  let sources: unknown[] = [];
  let summary = input.question;
  if (input.messageId) {
    const msg = (await db.query<{ content: string; answer_id: string | null; conversation_id: string; family_id: string }>(
      "select m.content, m.answer_id, m.conversation_id, c.family_id from messages m join conversations c on c.id = m.conversation_id where m.id = $1",
      [input.messageId],
    )).rows[0];
    if (!msg || msg.family_id !== ref.family_id) throw new ForbiddenError();
    aiResponse = msg.content;
    answerId = msg.answer_id;
    if (answerId) {
      const log = (await db.query<{ knowledge_documents_used: unknown[] }>("select knowledge_documents_used from agent_audit_logs where answer_id = $1", [answerId])).rows[0];
      sources = log?.knowledge_documents_used ?? [];
    }
  }
  if (input.conversationId) {
    const userMsgs = (await db.query<{ content: string }>(
      "select m.content from messages m join conversations c on c.id = m.conversation_id where m.conversation_id = $1 and c.family_id = $2 and m.role = 'user' order by m.created_at desc limit 4",
      [input.conversationId, ref.family_id],
    )).rows;
    if (userMsgs.length) summary = userMsgs.reverse().map((m) => m.content).join(" · ").slice(0, 1500);
  }
  const measurements = (await db.query("select measurement_type as type, value, secondary_value, unit, context, measured_at from measurements where profile_id = $1 and measured_at > now() - interval '30 days' order by measured_at desc limit 12", [input.profileId])).rows;
  const reports = (await db.query("select id, title, report_date as date from reports where profile_id = $1 order by created_at desc limit 5", [input.profileId])).rows;
  const symptoms = (await db.query("select description as label from symptoms where profile_id = $1 and created_at > now() - interval '14 days' order by created_at desc limit 8", [input.profileId])).rows;

  const { rows } = await db.query<{ id: string }>(
    `insert into doctor_reviews(family_id, profile_id, doctor_id, conversation_id, message_id, answer_id, requested_by, summary, symptoms, measurements, reports, ai_response, knowledge_sources, question, priority)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14,$15) returning id`,
    [ref.family_id, input.profileId, assignment.doctor_id, input.conversationId ?? null, input.messageId ?? null, answerId, actor.id, summary, JSON.stringify(symptoms), JSON.stringify(measurements), JSON.stringify(reports), aiResponse, JSON.stringify(sources), input.question, input.priority],
  );
  if (answerId) await db.query("update agent_audit_logs set doctor_review_requested = true, doctor_review_status = 'pending' where answer_id = $1", [answerId]);
  await notify({ userId: assignment.user_id, email: assignment.email, kind: "review_request", familyId: ref.family_id, title: `Review requested · ${input.priority}`, body: `A family asked for your review about ${ref.display_name}.`, link: `/doctor/reviews/${rows[0]!.id}` });
  await logAccess(actor, "create", "doctor_review", rows[0]!.id, ref.family_id);
  return rows[0]!.id;
}

export async function listFamilyReviews(actor: Actor, familyId: string, profileId?: string) {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  const args: unknown[] = [familyId];
  let where = "r.family_id = $1";
  if (profileId) {
    args.push(profileId);
    where += ` and r.profile_id = $2`;
  }
  return (await db.query<DoctorReview>(`${REVIEW_SELECT} where ${where} order by r.created_at desc`, args)).rows;
}

export async function listDoctorReviews(actor: Actor, status: "open" | "responded" | "all" = "open") {
  assertDoctor(actor);
  const db = await getDb();
  const statusFilter = status === "open" ? "and r.status in ('pending','in_review','more_info_requested')" : status === "responded" ? "and r.status in ('responded','consultation_scheduled','closed')" : "";
  return (
    await db.query<DoctorReview>(
      `${REVIEW_SELECT} join doctor_family_assignments a on a.family_id = r.family_id and a.doctor_id = r.doctor_id and a.status = 'active'
       where r.doctor_id = $1 ${statusFilter}
       order by case r.priority when 'urgent' then 0 when 'soon' then 1 else 2 end, r.created_at desc`,
      [actor.doctorId],
    )
  ).rows;
}

export async function getReview(actor: Actor, reviewId: string) {
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) throw new NotFoundError();
  const review = (await db.query<DoctorReview>(`${REVIEW_SELECT} where r.id = $1`, [reviewId])).rows[0];
  if (!review) throw new NotFoundError("Review not found");
  await assertFamilyAccess(actor, review.family_id);
  if (actor.role === "DOCTOR" && actor.doctorId && !actor.familyIds.includes(review.family_id) && review.doctor_id !== actor.doctorId) throw new ForbiddenError();
  return review;
}

/** Doctor actions on a case. A response is written into the patient's record and shown in their chat. */
export async function actOnReview(actor: Actor, raw: unknown) {
  assertDoctor(actor);
  const input = reviewActionSchema.parse(raw);
  const review = await getReview(actor, input.reviewId);
  if (review.doctor_id !== actor.doctorId) throw new ForbiddenError();
  await assertFamilyAccess(actor, review.family_id, "clinical_write");
  const db = await getDb();
  const text = input.response?.trim() || null;
  const statusFor: Record<string, string> = { start: "in_review", respond: "responded", approve: "responded", request_info: "more_info_requested", schedule: "consultation_scheduled", close: "closed" };
  if ((input.action === "respond" || input.action === "request_info") && !text) throw new Error("Write a response for the family.");
  const response =
    input.action === "approve"
      ? text ?? "I've reviewed the assistant's explanation and agree with it."
      : input.action === "schedule"
        ? text ?? "I'd like to see you for a consultation about this. Please book a time."
        : text;
  await db.query(
    `update doctor_reviews set status = $2, doctor_response = coalesce($3, doctor_response), approved_ai_response = case when $4 then true else approved_ai_response end,
      responded_at = case when $3::text is not null then now() else responded_at end, updated_at = now() where id = $1`,
    [review.id, statusFor[input.action], response, input.action === "approve"],
  );
  if (review.answer_id) await db.query("update agent_audit_logs set doctor_review_status = $2 where answer_id = $1", [review.answer_id, statusFor[input.action]]);

  if (response && input.action !== "start") {
    const doctorName = (await db.query<{ full_name: string }>("select full_name from doctors where id = $1", [actor.doctorId])).rows[0]!.full_name;
    if (input.addToRecord && input.action !== "request_info") {
      await db.query("insert into doctor_notes(profile_id, doctor_id, note, review_id) values ($1,$2,$3,$4)", [review.profile_id, actor.doctorId, response, review.id]);
    }
    if (review.conversation_id) {
      await db.query(
        "insert into messages(conversation_id, profile_id, role, content, cards, author_user_id) values ($1,$2,'doctor',$3,$4::jsonb,$5)",
        [review.conversation_id, review.profile_id, response, JSON.stringify([{ type: "doctor_reply", reviewId: review.id, doctorName, action: input.action }]), actor.id],
      );
      await db.query("update conversations set last_message_at = now() where id = $1", [review.conversation_id]);
    }
    if (input.action === "schedule") {
      await db.query(
        "insert into appointments(family_id, profile_id, doctor_id, starts_at, appointment_type, status, notes, created_by) values ($1,$2,$3, date_trunc('hour', now()) + interval '2 days 10 hours', 'in_person', 'requested', $4, $5)",
        [review.family_id, review.profile_id, actor.doctorId, `Consultation requested by doctor after review: ${review.question.slice(0, 200)}`, actor.id],
      );
    }
    await notifyFamily(review.family_id, {
      kind: "doctor_response",
      profileId: review.profile_id,
      title: input.action === "request_info" ? "Your doctor needs a little more information" : "Your doctor responded",
      body: `${doctorName} replied to your review request about ${review.profile_name}.`,
      link: review.conversation_id ? `/app/chat/${review.conversation_id}` : `/care`,
    });
  }
  await logAccess(actor, `review_${input.action}`, "doctor_review", review.id, review.family_id);
}

export async function addReviewFollowUp(actor: Actor, reviewId: string, text: string) {
  const review = await getReview(actor, reviewId);
  await assertFamilyAccess(actor, review.family_id, "write");
  if (!text.trim()) throw new Error("Write a reply first.");
  const db = await getDb();
  await db.query(
    "update doctor_reviews set question = question || E'\\n\\nFollow-up from family: ' || $2, status = 'pending', updated_at = now() where id = $1",
    [reviewId, text.trim().slice(0, 2000)],
  );
  const doc = (await db.query<{ user_id: string; email: string }>("select d.user_id, u.email from doctors d join users u on u.id = d.user_id where d.id = $1", [review.doctor_id])).rows[0];
  if (doc) await notify({ userId: doc.user_id, email: doc.email, kind: "review_request", title: "Family replied to your question", body: `More information was added for ${review.profile_name}.`, link: `/doctor/reviews/${reviewId}` });
}
