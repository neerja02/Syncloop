import "server-only";
import { getDb } from "@/lib/database/client";
import { assertDoctor, assertFamilyAccess, assertProfileAccess, ForbiddenError, logAccess, NotFoundError } from "@/lib/security/access";
import { doctorInstructionSchema } from "@/lib/validation/health";
import { notify, notifyFamily } from "./notifications";
import type { Actor, Doctor } from "@/types/domain";

export async function getDoctorProfile(actor: Actor): Promise<Doctor> {
  assertDoctor(actor);
  const db = await getDb();
  return (await db.query<Doctor>("select * from doctors where id = $1", [actor.doctorId])).rows[0]!;
}

export async function updateDoctorProfile(actor: Actor, data: Partial<Pick<Doctor, "speciality" | "clinic_name" | "clinic_address" | "bio" | "contact_hours" | "accepting_reviews">> & { languages?: string[]; consultation_types?: string[] }) {
  assertDoctor(actor);
  const db = await getDb();
  await db.query(
    `update doctors set speciality = coalesce($2, speciality), clinic_name = coalesce($3, clinic_name), clinic_address = coalesce($4, clinic_address), bio = coalesce($5, bio),
     contact_hours = coalesce($6, contact_hours), accepting_reviews = coalesce($7, accepting_reviews), languages = coalesce($8, languages), consultation_types = coalesce($9, consultation_types), updated_at = now() where id = $1`,
    [actor.doctorId, data.speciality ?? null, data.clinic_name ?? null, data.clinic_address ?? null, data.bio ?? null, data.contact_hours ?? null, data.accepting_reviews ?? null, data.languages ?? null, data.consultation_types ?? null],
  );
}

export interface DoctorFamily {
  id: string;
  name: string;
  assigned_at: Date;
  member_count: number;
  pending_reviews: number;
  unread_messages: number;
  last_activity: Date | null;
  is_demo: boolean;
}

export async function listDoctorFamilies(actor: Actor): Promise<DoctorFamily[]> {
  assertDoctor(actor);
  const db = await getDb();
  return (
    await db.query<DoctorFamily>(
      `select f.id, f.name, f.is_demo, a.assigned_at,
        (select count(*) from profiles p where p.family_id = f.id) as member_count,
        (select count(*) from doctor_reviews r where r.family_id = f.id and r.doctor_id = $1 and r.status in ('pending','in_review')) as pending_reviews,
        (select count(*) from doctor_messages m where m.family_id = f.id and m.doctor_id = $1 and m.sender_role = 'family' and m.read_at is null) as unread_messages,
        greatest((select max(created_at) from reports r where r.family_id = f.id), (select max(created_at) from doctor_reviews r where r.family_id = f.id)) as last_activity
       from doctor_family_assignments a join families f on f.id = a.family_id
       where a.doctor_id = $1 and a.status = 'active' order by f.name`,
      [actor.doctorId],
    )
  ).rows;
}

export async function getDoctorFamily(actor: Actor, familyId: string) {
  assertDoctor(actor);
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  const family = (await db.query<{ id: string; name: string; country_code: string; is_demo: boolean }>("select id, name, country_code, is_demo from families where id = $1", [familyId])).rows[0]!;
  const profiles = (
    await db.query<{ id: string; display_name: string; relationship: string; date_of_birth: string | null; sex: string | null; avatar_color: string; conditions: string[]; active_meds: number; last_report: Date | null; open_reviews: number }>(
      `select p.id, p.display_name, p.relationship, p.date_of_birth, p.sex, p.avatar_color,
        coalesce((select array_agg(name) from health_conditions c where c.profile_id = p.id and c.status <> 'resolved'), '{}') as conditions,
        (select count(*) from medications m where m.profile_id = p.id and m.status = 'active') as active_meds,
        (select max(created_at) from reports r where r.profile_id = p.id) as last_report,
        (select count(*) from doctor_reviews r where r.profile_id = p.id and r.status in ('pending','in_review','more_info_requested')) as open_reviews
       from profiles p where p.family_id = $1 order by p.created_at`,
      [familyId],
    )
  ).rows;
  await logAccess(actor, "view", "family", familyId, familyId);
  return { family, profiles };
}

export async function doctorDashboard(actor: Actor) {
  assertDoctor(actor);
  const db = await getDb();
  const id = actor.doctorId;
  const [counts, reviews, reports, escalations, appointments, messages] = await Promise.all([
    db.query<{ families: number; patients: number; pending_reviews: number; unread: number; upcoming: number }>(
      `select
        (select count(*) from doctor_family_assignments where doctor_id = $1 and status = 'active') as families,
        (select count(*) from profiles p join doctor_family_assignments a on a.family_id = p.family_id and a.status = 'active' where a.doctor_id = $1) as patients,
        (select count(*) from doctor_reviews where doctor_id = $1 and status in ('pending','in_review')) as pending_reviews,
        (select count(*) from doctor_messages where doctor_id = $1 and sender_role = 'family' and read_at is null) as unread,
        (select count(*) from appointments where doctor_id = $1 and status in ('requested','confirmed') and starts_at >= now()) as upcoming`,
      [id],
    ),
    db.query<{ id: string; profile_name: string; family_name: string; question: string; priority: string; status: string; created_at: Date }>(
      `select r.id, p.display_name as profile_name, f.name as family_name, r.question, r.priority, r.status, r.created_at
       from doctor_reviews r join profiles p on p.id = r.profile_id join families f on f.id = r.family_id
       join doctor_family_assignments a on a.family_id = r.family_id and a.doctor_id = $1 and a.status = 'active'
       where r.doctor_id = $1 and r.status in ('pending','in_review','more_info_requested')
       order by case r.priority when 'urgent' then 0 when 'soon' then 1 else 2 end, r.created_at limit 8`,
      [id],
    ),
    db.query<{ id: string; title: string; profile_name: string; family_name: string; status: string; created_at: Date; doctor_reviewed_at: Date | null }>(
      `select r.id, r.title, p.display_name as profile_name, f.name as family_name, r.status, r.created_at, r.doctor_reviewed_at
       from reports r join profiles p on p.id = r.profile_id join families f on f.id = r.family_id
       join doctor_family_assignments a on a.family_id = r.family_id and a.doctor_id = $1 and a.status = 'active'
       order by r.created_at desc limit 6`,
      [id],
    ),
    db.query<{ answer_id: string; agent: string; urgency: string; profile_name: string; family_id: string; profile_id: string; created_at: Date }>(
      `select l.answer_id, l.agent, l.urgency, p.display_name as profile_name, l.family_id, l.profile_id, l.created_at
       from agent_audit_logs l join profiles p on p.id = l.profile_id
       join doctor_family_assignments a on a.family_id = l.family_id and a.doctor_id = $1 and a.status = 'active'
       where l.urgency in ('HIGH','EMERGENCY') order by l.created_at desc limit 6`,
      [id],
    ),
    db.query<{ id: string; starts_at: Date; profile_name: string; appointment_type: string; status: string }>(
      `select a.id, a.starts_at, p.display_name as profile_name, a.appointment_type, a.status from appointments a join profiles p on p.id = a.profile_id
       where a.doctor_id = $1 and a.status in ('requested','confirmed') and a.starts_at >= now() - interval '1 hour' order by a.starts_at limit 6`,
      [id],
    ),
    db.query<{ id: string; family_id: string; family_name: string; body: string; created_at: Date }>(
      `select m.id, m.family_id, f.name as family_name, m.body, m.created_at from doctor_messages m join families f on f.id = m.family_id
       where m.doctor_id = $1 and m.sender_role = 'family' and m.read_at is null order by m.created_at desc limit 6`,
      [id],
    ),
  ]);
  return { counts: counts.rows[0]!, reviews: reviews.rows, reports: reports.rows, escalations: escalations.rows, appointments: appointments.rows, messages: messages.rows };
}

// ---------------------------------------------------------------------------
// Patient-specific instructions (versioned)
// ---------------------------------------------------------------------------
export async function addInstruction(actor: Actor, raw: unknown, supersedesId?: string | null) {
  assertDoctor(actor);
  const input = doctorInstructionSchema.parse(raw);
  const ref = await assertProfileAccess(actor, input.profileId, "clinical_write");
  const db = await getDb();
  let version = 1;
  if (supersedesId) {
    const prev = (await db.query<{ version: number; profile_id: string; doctor_id: string }>("select version, profile_id, doctor_id from doctor_patient_instructions where id = $1", [supersedesId])).rows[0];
    if (!prev || prev.profile_id !== input.profileId) throw new NotFoundError();
    version = prev.version + 1;
    await db.query("update doctor_patient_instructions set active = false, updated_at = now() where id = $1", [supersedesId]);
  }
  await db.query(
    "insert into doctor_patient_instructions(profile_id, doctor_id, instruction_type, instruction, reason, topics, version, supersedes_id) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [input.profileId, actor.doctorId, input.instructionType, input.instruction, input.reason, input.topics, version, supersedesId ?? null],
  );
  await logAccess(actor, "create", "doctor_instruction", input.profileId, ref.family_id);
  await notifyFamily(ref.family_id, { kind: "doctor_response", profileId: input.profileId, title: "New guidance from your doctor", body: `Your doctor added guidance for ${ref.display_name}.`, link: `/family/${input.profileId}` });
}

export async function deactivateInstruction(actor: Actor, id: string) {
  assertDoctor(actor);
  const db = await getDb();
  const row = (await db.query<{ profile_id: string }>("select profile_id from doctor_patient_instructions where id = $1", [id])).rows[0];
  if (!row) throw new NotFoundError();
  await assertProfileAccess(actor, row.profile_id, "clinical_write");
  await db.query("update doctor_patient_instructions set active = false, updated_at = now() where id = $1", [id]);
}

export async function addDoctorNote(actor: Actor, profileId: string, note: string, reviewId?: string | null) {
  assertDoctor(actor);
  const ref = await assertProfileAccess(actor, profileId, "clinical_write");
  if (note.trim().length < 2) throw new Error("Write a note first.");
  const db = await getDb();
  await db.query("insert into doctor_notes(profile_id, doctor_id, note, review_id) values ($1,$2,$3,$4)", [profileId, actor.doctorId, note.trim().slice(0, 5000), reviewId ?? null]);
  await logAccess(actor, "create", "doctor_note", profileId, ref.family_id);
}

export async function markReportReviewed(actor: Actor, reportId: string, notes: string | null) {
  assertDoctor(actor);
  const db = await getDb();
  const r = (await db.query<{ family_id: string; profile_id: string; title: string }>("select family_id, profile_id, title from reports where id = $1", [reportId])).rows[0];
  if (!r) throw new NotFoundError();
  await assertFamilyAccess(actor, r.family_id, "clinical_write");
  await db.query("update reports set doctor_reviewed_at = now(), doctor_reviewed_by = $2, doctor_notes = coalesce($3, doctor_notes), updated_at = now() where id = $1", [reportId, actor.doctorId, notes?.trim() || null]);
  await notifyFamily(r.family_id, { kind: "report_reviewed", profileId: r.profile_id, title: "Report reviewed by your doctor", body: `Your doctor reviewed "${r.title}".`, link: `/reports/${reportId}` });
}

// ---------------------------------------------------------------------------
// Messages between a family and its doctor
// ---------------------------------------------------------------------------
export interface DoctorMessage {
  id: string;
  family_id: string;
  doctor_id: string;
  profile_id: string | null;
  profile_name: string | null;
  sender_role: "family" | "doctor";
  sender_name: string | null;
  body: string;
  read_at: Date | null;
  created_at: Date;
}

export async function listMessages(actor: Actor, familyId: string) {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  const doctorId = actor.doctorId ?? (await db.query<{ doctor_id: string }>("select doctor_id from doctor_family_assignments where family_id = $1 and status = 'active'", [familyId])).rows[0]?.doctor_id;
  if (!doctorId) return [];
  const rows = (
    await db.query<DoctorMessage>(
      `select m.*, p.display_name as profile_name, u.full_name as sender_name from doctor_messages m
       left join profiles p on p.id = m.profile_id left join users u on u.id = m.sender_user_id
       where m.family_id = $1 and m.doctor_id = $2 order by m.created_at`,
      [familyId, doctorId],
    )
  ).rows;
  const otherSide = actor.doctorId === doctorId ? "family" : "doctor";
  await db.query("update doctor_messages set read_at = now() where family_id = $1 and doctor_id = $2 and sender_role = $3 and read_at is null", [familyId, doctorId, otherSide]);
  return rows;
}

export async function sendMessage(actor: Actor, familyId: string, body: string, profileId?: string | null) {
  const text = body.trim();
  if (!text) throw new Error("Write a message first.");
  if (text.length > 5000) throw new Error("Messages are limited to 5,000 characters.");
  const db = await getDb();
  const isDoctor = actor.role === "DOCTOR" && !!actor.doctorId && !actor.familyIds.includes(familyId);
  await assertFamilyAccess(actor, familyId, isDoctor ? "clinical_write" : "write");
  const doctorId = isDoctor ? actor.doctorId! : (await db.query<{ doctor_id: string }>("select doctor_id from doctor_family_assignments where family_id = $1 and status = 'active'", [familyId])).rows[0]?.doctor_id;
  if (!doctorId) throw new Error("Your family doesn't have an assigned doctor yet.");
  if (profileId) {
    const p = await assertProfileAccess(actor, profileId);
    if (p.family_id !== familyId) throw new ForbiddenError();
  }
  await db.query("insert into doctor_messages(family_id, doctor_id, profile_id, sender_user_id, sender_role, body) values ($1,$2,$3,$4,$5,$6)", [familyId, doctorId, profileId ?? null, actor.id, isDoctor ? "doctor" : "family", text]);
  if (isDoctor) {
    await notifyFamily(familyId, { kind: "doctor_message", title: "New message from your doctor", body: "You have a new message from your family doctor.", link: "/care" });
  } else {
    const docUser = (await db.query<{ user_id: string; email: string }>("select d.user_id, u.email from doctors d join users u on u.id = d.user_id where d.id = $1", [doctorId])).rows[0];
    if (docUser) await notify({ userId: docUser.user_id, email: docUser.email, kind: "doctor_message", familyId, title: "New family message", body: "A family you care for sent a message.", link: `/doctor/messages?family=${familyId}` });
  }
}

export async function doctorMessageThreads(actor: Actor) {
  assertDoctor(actor);
  const db = await getDb();
  return (
    await db.query<{ family_id: string; family_name: string; last_body: string | null; last_at: Date | null; unread: number }>(
      `select f.id as family_id, f.name as family_name,
        (select body from doctor_messages m where m.family_id = f.id and m.doctor_id = $1 order by created_at desc limit 1) as last_body,
        (select max(created_at) from doctor_messages m where m.family_id = f.id and m.doctor_id = $1) as last_at,
        (select count(*) from doctor_messages m where m.family_id = f.id and m.doctor_id = $1 and m.sender_role = 'family' and m.read_at is null) as unread
       from doctor_family_assignments a join families f on f.id = a.family_id where a.doctor_id = $1 and a.status = 'active'
       order by last_at desc nulls last`,
      [actor.doctorId],
    )
  ).rows;
}
