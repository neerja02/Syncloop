import "server-only";
import { getDb } from "@/lib/database/client";
import { assertDoctor, assertFamilyAccess, assertProfileAccess, logAccess, NotFoundError } from "@/lib/security/access";
import { appointmentInputSchema } from "@/lib/validation/health";
import { notify, notifyFamily } from "./notifications";
import type { Actor } from "@/types/domain";

export interface Appointment {
  id: string;
  family_id: string;
  profile_id: string;
  profile_name: string;
  doctor_id: string | null;
  doctor_name: string | null;
  provider_name: string | null;
  speciality: string | null;
  starts_at: Date;
  duration_minutes: number;
  location: string | null;
  appointment_type: string;
  notes: string | null;
  status: "requested" | "confirmed" | "completed" | "cancelled";
  discussion_points: { points: string[]; generatedAt: string } | null;
  created_at: Date;
}

const SELECT = `select a.*, p.display_name as profile_name, d.full_name as doctor_name from appointments a join profiles p on p.id = a.profile_id left join doctors d on d.id = a.doctor_id`;

export async function listAppointments(actor: Actor, familyId: string, profileId?: string) {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  const args: unknown[] = [familyId];
  let where = "a.family_id = $1";
  if (profileId) {
    args.push(profileId);
    where += " and a.profile_id = $2";
  }
  return (await db.query<Appointment>(`${SELECT} where ${where} order by a.starts_at desc`, args)).rows;
}

export async function listDoctorAppointments(actor: Actor) {
  assertDoctor(actor);
  const db = await getDb();
  return (
    await db.query<Appointment & { family_name: string }>(
      `${SELECT.replace("from appointments a", "from appointments a join families f on f.id = a.family_id").replace("select a.*,", "select a.*, f.name as family_name,")}
       join doctor_family_assignments x on x.family_id = a.family_id and x.doctor_id = $1 and x.status = 'active'
       where a.doctor_id = $1 order by a.starts_at`,
      [actor.doctorId],
    )
  ).rows;
}

export async function createAppointment(actor: Actor, raw: unknown) {
  const input = appointmentInputSchema.parse(raw);
  const ref = await assertProfileAccess(actor, input.profileId, "write");
  const db = await getDb();
  if (input.doctorId) {
    const ok = await db.query("select 1 from doctor_family_assignments where doctor_id = $1 and family_id = $2 and status = 'active'", [input.doctorId, ref.family_id]);
    if (!ok.rows.length) throw new Error("You can only book with your family's assigned doctor or a listed provider.");
  }
  let providerName = input.providerName;
  let location = input.location;
  if (input.providerId) {
    const p = (await db.query<{ name: string; address: string | null; clinic: string | null }>("select name, address, clinic from providers where id = $1", [input.providerId])).rows[0];
    if (!p) throw new Error("Provider not found");
    providerName ??= p.name;
    location ??= [p.clinic, p.address].filter(Boolean).join(", ");
  }
  const { rows } = await db.query<{ id: string }>(
    `insert into appointments(family_id, profile_id, doctor_id, provider_id, provider_name, speciality, starts_at, location, appointment_type, notes, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'requested',$11) returning id`,
    [ref.family_id, input.profileId, input.doctorId ?? null, input.providerId ?? null, providerName, input.speciality, input.startsAt, location, input.appointmentType, input.notes, actor.id],
  );
  if (input.doctorId) {
    const doc = (await db.query<{ user_id: string; email: string }>("select d.user_id, u.email from doctors d join users u on u.id = d.user_id where d.id = $1", [input.doctorId])).rows[0];
    if (doc) await notify({ userId: doc.user_id, email: doc.email, kind: "appointment_reminder", familyId: ref.family_id, title: "New appointment request", body: `${ref.display_name} requested an appointment.`, link: "/doctor/appointments" });
  }
  await logAccess(actor, "create", "appointment", rows[0]!.id, ref.family_id);
  return rows[0]!.id;
}

async function load(actor: Actor, id: string) {
  const db = await getDb();
  const a = (await db.query<Appointment>(`${SELECT} where a.id = $1`, [id])).rows[0];
  if (!a) throw new NotFoundError("Appointment not found");
  await assertFamilyAccess(actor, a.family_id);
  return a;
}

export async function updateAppointment(actor: Actor, id: string, data: { status?: Appointment["status"]; startsAt?: Date; notes?: string | null }) {
  const a = await load(actor, id);
  const isDoctor = actor.role === "DOCTOR" && actor.doctorId === a.doctor_id;
  if (!isDoctor) await assertFamilyAccess(actor, a.family_id, "write");
  if (data.status === "confirmed" && !isDoctor && a.doctor_id) throw new Error("Only the doctor's clinic can confirm this appointment.");
  if (data.startsAt && data.startsAt.getTime() < Date.now() - 3600000) throw new Error("Choose a future date and time.");
  const db = await getDb();
  await db.query(
    "update appointments set status = coalesce($2, status), starts_at = coalesce($3, starts_at), notes = coalesce($4, notes), updated_at = now() where id = $1",
    [id, data.startsAt && !data.status ? "requested" : data.status ?? null, data.startsAt ?? null, data.notes ?? null],
  );
  if (isDoctor && data.status) {
    await notifyFamily(a.family_id, { kind: "appointment_reminder", profileId: a.profile_id, title: `Appointment ${data.status}`, body: `Your appointment for ${a.profile_name} is ${data.status}.`, link: "/appointments" });
  }
  await logAccess(actor, "update", "appointment", id, a.family_id, { status: data.status });
}

/** "Things to discuss with your doctor" — assembled from recent measurements, reports, symptoms and questions. */
export async function generateDiscussionPoints(actor: Actor, id: string) {
  const a = await load(actor, id);
  const db = await getDb();
  const points: string[] = [];
  const glucose = (await db.query<{ value: number; context: string | null }>("select value, context from measurements where profile_id = $1 and measurement_type = 'blood_glucose' and measured_at > now() - interval '30 days' order by measured_at desc", [a.profile_id])).rows;
  if (glucose.length) {
    const after = glucose.filter((g) => g.context === "after_meal").map((g) => g.value);
    const fasting = glucose.filter((g) => g.context === "fasting").map((g) => g.value);
    if (fasting.length) points.push(`Fasting glucose readings this month ranged ${Math.min(...fasting)}–${Math.max(...fasting)} mg/dL (${fasting.length} readings).`);
    if (after.length) points.push(`After-meal glucose readings ranged ${Math.min(...after)}–${Math.max(...after)} mg/dL (${after.length} readings).`);
  }
  const bp = (await db.query<{ value: number; secondary_value: number }>("select value, secondary_value from measurements where profile_id = $1 and measurement_type = 'blood_pressure' and measured_at > now() - interval '30 days' order by measured_at desc", [a.profile_id])).rows;
  if (bp.length) points.push(`Blood pressure this month: ${bp.length} readings, highest ${Math.max(...bp.map((b) => b.value))}/${Math.max(...bp.map((b) => b.secondary_value))} mmHg.`);
  const hba1c = (await db.query<{ value: number; observed_at: string }>("select value, observed_at from report_results where profile_id = $1 and canonical_name = 'HbA1c' and status = 'confirmed' and value is not null order by observed_at desc nulls last limit 2", [a.profile_id])).rows;
  if (hba1c.length === 2) points.push(`HbA1c changed from ${hba1c[1]!.value}% to ${hba1c[0]!.value}%. Ask what target is right for you.`);
  else if (hba1c.length === 1) points.push(`Latest HbA1c: ${hba1c[0]!.value}%. Ask what target is right for you.`);
  const outside = (await db.query<{ canonical_name: string; flag: string }>("select distinct canonical_name, flag from report_results where profile_id = $1 and flag in ('high','low') and status = 'confirmed' and created_at > now() - interval '120 days'", [a.profile_id])).rows;
  for (const o of outside.slice(0, 3)) points.push(`Recent ${o.canonical_name} result was ${o.flag} compared with the report's reference range. What does it mean for me?`);
  const meds = (await db.query<{ name: string; strength: string | null }>("select name, strength from medications where profile_id = $1 and status = 'active'", [a.profile_id])).rows;
  if (meds.length) points.push(`Review current medicines: ${meds.map((m) => m.name + (m.strength ? " " + m.strength : "")).join(", ")}. Mention any side effects or missed doses.`);
  const symptoms = (await db.query<{ description: string }>("select description from symptoms where profile_id = $1 and created_at > now() - interval '30 days' order by created_at desc limit 3", [a.profile_id])).rows;
  for (const s of symptoms) points.push(`Recent symptom discussed: ${s.description}.`);
  if (!points.length) points.push("Bring any recent reports and a list of current medicines.", "Note any symptoms, when they started and what makes them better or worse.");
  const payload = { points, generatedAt: new Date().toISOString() };
  await db.query("update appointments set discussion_points = $2::jsonb, updated_at = now() where id = $1", [id, JSON.stringify(payload)]);
  return payload;
}
