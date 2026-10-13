import "server-only";
import { getDb } from "@/lib/database/client";
import { assertProfileAccess, logAccess } from "@/lib/security/access";
import {
  allergyInputSchema,
  conditionInputSchema,
  goalInputSchema,
  measurementInputSchema,
  medicationInputSchema,
} from "@/lib/validation/health";
import { decideConfidence } from "@/lib/config/confidence";
import { getMedicationTerminology } from "@/lib/integrations/terminology/medication";
import type { Actor, Measurement, MeasurementType, Medication } from "@/types/domain";

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------
export async function addMeasurement(actor: Actor, raw: unknown) {
  const m = measurementInputSchema.parse(raw);
  const ref = await assertProfileAccess(actor, m.profileId, "write");
  const db = await getDb();
  const { rows } = await db.query<Measurement>(
    `insert into measurements(profile_id, measurement_type, value, secondary_value, unit, context, minutes_after_meal, source, measured_at, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [m.profileId, m.measurementType, m.value, m.secondaryValue ?? null, m.unit, m.context ?? null, m.minutesAfterMeal ?? null, m.source, m.measuredAt ?? new Date(), m.notes ?? null, actor.id],
  );
  await logAccess(actor, "create", "measurement", rows[0]!.id, ref.family_id);
  return rows[0]!;
}

export const RANGE_DAYS: Record<string, number | null> = { "7d": 7, "30d": 30, "3m": 90, "6m": 182, "1y": 365, all: null };

export async function listMeasurements(actor: Actor, profileId: string, type?: MeasurementType, range: keyof typeof RANGE_DAYS = "all") {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  const days = RANGE_DAYS[range] ?? null;
  const args: unknown[] = [profileId];
  let where = "profile_id = $1";
  if (type) {
    args.push(type);
    where += ` and measurement_type = $${args.length}`;
  }
  if (days) {
    args.push(new Date(Date.now() - days * 86400000));
    where += ` and measured_at >= $${args.length}`;
  }
  return (await db.query<Measurement>(`select * from measurements where ${where} order by measured_at desc limit 1000`, args)).rows;
}

export async function deleteMeasurement(actor: Actor, id: string) {
  const db = await getDb();
  const row = (await db.query<{ profile_id: string }>("select profile_id from measurements where id = $1", [id])).rows[0];
  if (!row) return;
  await assertProfileAccess(actor, row.profile_id, "write");
  await db.query("delete from measurements where id = $1", [id]);
}

export async function latestMeasurements(actor: Actor, profileId: string) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  return (
    await db.query<Measurement>(
      `select distinct on (measurement_type) * from measurements where profile_id = $1 order by measurement_type, measured_at desc`,
      [profileId],
    )
  ).rows;
}

// ---------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------
export interface MedicationSaveResult {
  status: "saved" | "needs_confirmation";
  medication?: Medication;
  suggestion?: { original: string; canonical: string; confidence: number; alternatives: string[] };
}

/**
 * Saves a medication. If the typed name is not an exact terminology match and the user hasn't confirmed it,
 * nothing is written and a suggestion is returned for confirmation ("Did you mean Metformin?").
 */
export async function saveMedication(actor: Actor, raw: unknown, medicationId?: string): Promise<MedicationSaveResult> {
  const m = medicationInputSchema.parse(raw);
  const ref = await assertProfileAccess(actor, m.profileId, "write");
  const norm = await getMedicationTerminology().normalise(m.name);
  const decision = decideConfidence("medication_name", norm.confidence);
  const exact = norm.canonical_name && norm.confidence >= 1;
  if (!m.nameConfirmed && !exact && decision === "confirm" && norm.canonical_name) {
    return {
      status: "needs_confirmation",
      suggestion: {
        original: m.name,
        canonical: norm.canonical_name,
        confidence: norm.confidence,
        alternatives: norm.possible_matches.slice(1).map((p) => p.canonical_name),
      },
    };
  }
  const db = await getDb();
  const generic = m.genericName ?? (exact ? norm.generic_name : null);
  const brand = m.brandName ?? (exact ? norm.brand_name : null);
  const values = [
    m.profileId,
    m.name,
    generic,
    brand,
    m.strength ?? norm.strength,
    m.form ?? norm.form,
    m.frequency,
    m.duration,
    m.reason,
    m.instructions,
    m.prescribingDoctor,
    m.startDate,
    m.endDate,
    m.originalText ?? (m.nameConfirmed && m.originalText ? m.originalText : null),
    m.externalId ?? (exact ? norm.external_id : null),
    m.terminologyConfidence ?? norm.confidence,
    m.reminderTimes,
  ];
  let row: Medication;
  if (medicationId) {
    const existing = (await db.query<{ profile_id: string }>("select profile_id from medications where id = $1", [medicationId])).rows[0];
    if (!existing || existing.profile_id !== m.profileId) throw new Error("Medication not found");
    row = (
      await db.query<Medication>(
        `update medications set name=$2, generic_name=$3, brand_name=$4, strength=$5, form=$6, frequency=$7, duration=$8, reason=$9, instructions=$10,
          prescribing_doctor=$11, start_date=$12, end_date=$13, original_text=coalesce($14, original_text), external_id=$15, terminology_confidence=$16, reminder_times=$17, updated_at=now()
         where id=$18 returning *`,
        [...values, medicationId],
      )
    ).rows[0]!;
  } else {
    row = (
      await db.query<Medication>(
        `insert into medications(profile_id, name, generic_name, brand_name, strength, form, frequency, duration, reason, instructions, prescribing_doctor,
          start_date, end_date, original_text, external_id, terminology_confidence, reminder_times)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
        values,
      )
    ).rows[0]!;
  }
  await logAccess(actor, medicationId ? "update" : "create", "medication", row.id, ref.family_id);
  return { status: "saved", medication: row };
}

export async function setMedicationStatus(actor: Actor, medicationId: string, status: "active" | "stopped" | "completed") {
  const db = await getDb();
  const row = (await db.query<{ profile_id: string }>("select profile_id from medications where id = $1", [medicationId])).rows[0];
  if (!row) throw new Error("Medication not found");
  await assertProfileAccess(actor, row.profile_id, "write");
  await db.query("update medications set status=$2, end_date = case when $2 <> 'active' then coalesce(end_date, current_date) else end_date end, updated_at=now() where id=$1", [medicationId, status]);
}

export async function listMedications(actor: Actor, profileId: string) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  return (await db.query<Medication>("select * from medications where profile_id = $1 order by status = 'active' desc, start_date desc nulls last, created_at desc", [profileId])).rows;
}

export async function getMedication(actor: Actor, id: string) {
  const db = await getDb();
  const row = (await db.query<Medication>("select * from medications where id = $1", [id])).rows[0];
  if (!row) return null;
  await assertProfileAccess(actor, row.profile_id);
  return row;
}

// ---------------------------------------------------------------------------
// Conditions, allergies, goals, check-ins
// ---------------------------------------------------------------------------
export interface Condition {
  id: string;
  profile_id: string;
  name: string;
  status: string;
  diagnosed_on: string | null;
  notes: string | null;
  source: string;
}
export interface Allergy {
  id: string;
  profile_id: string;
  substance: string;
  reaction: string | null;
  severity: string | null;
}

export async function listConditions(actor: Actor, profileId: string) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  return (await db.query<Condition>("select * from health_conditions where profile_id = $1 order by status, name", [profileId])).rows;
}

export async function addCondition(actor: Actor, raw: unknown, source: "user" | "chat" | "doctor" = "user") {
  const c = conditionInputSchema.parse(raw);
  await assertProfileAccess(actor, c.profileId, "write");
  const db = await getDb();
  await db.query("insert into health_conditions(profile_id, name, status, diagnosed_on, notes, source) values ($1,$2,$3,$4,$5,$6)", [c.profileId, c.name, c.status, c.diagnosedOn, c.notes, source]);
}

export async function updateConditionStatus(actor: Actor, id: string, status: "active" | "resolved" | "monitoring") {
  const db = await getDb();
  const row = (await db.query<{ profile_id: string }>("select profile_id from health_conditions where id = $1", [id])).rows[0];
  if (!row) return;
  await assertProfileAccess(actor, row.profile_id, "write");
  await db.query("update health_conditions set status = $2, updated_at = now() where id = $1", [id, status]);
}

export async function deleteCondition(actor: Actor, id: string) {
  const db = await getDb();
  const row = (await db.query<{ profile_id: string }>("select profile_id from health_conditions where id = $1", [id])).rows[0];
  if (!row) return;
  await assertProfileAccess(actor, row.profile_id, "write");
  await db.query("delete from health_conditions where id = $1", [id]);
}

export async function listAllergies(actor: Actor, profileId: string) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  return (await db.query<Allergy>("select * from allergies where profile_id = $1 order by substance", [profileId])).rows;
}

export async function addAllergy(actor: Actor, raw: unknown) {
  const a = allergyInputSchema.parse(raw);
  await assertProfileAccess(actor, a.profileId, "write");
  const db = await getDb();
  await db.query("insert into allergies(profile_id, substance, reaction, severity) values ($1,$2,$3,$4)", [a.profileId, a.substance, a.reaction, a.severity]);
}

export async function deleteAllergy(actor: Actor, id: string) {
  const db = await getDb();
  const row = (await db.query<{ profile_id: string }>("select profile_id from allergies where id = $1", [id])).rows[0];
  if (!row) return;
  await assertProfileAccess(actor, row.profile_id, "write");
  await db.query("delete from allergies where id = $1", [id]);
}

export interface Goal {
  id: string;
  profile_id: string;
  title: string;
  category: string;
  target_value: number | null;
  unit: string | null;
  due_date: string | null;
  progress: number;
  status: string;
}

export async function listGoals(actor: Actor, profileId: string) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  return (await db.query<Goal>("select * from health_goals where profile_id = $1 order by status = 'active' desc, created_at desc", [profileId])).rows;
}

export async function addGoal(actor: Actor, raw: unknown) {
  const g = goalInputSchema.parse(raw);
  await assertProfileAccess(actor, g.profileId, "write");
  const db = await getDb();
  await db.query("insert into health_goals(profile_id, title, category, target_value, unit, due_date) values ($1,$2,$3,$4,$5,$6)", [g.profileId, g.title, g.category, g.targetValue ?? null, g.unit, g.dueDate]);
}

export async function updateGoalProgress(actor: Actor, id: string, progress: number) {
  const db = await getDb();
  const row = (await db.query<{ profile_id: string }>("select profile_id from health_goals where id = $1", [id])).rows[0];
  if (!row) return;
  await assertProfileAccess(actor, row.profile_id, "write");
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  await db.query("update health_goals set progress = $2, status = case when $2 >= 100 then 'achieved' else 'active' end, updated_at = now() where id = $1", [id, p]);
}

export async function addCheckIn(actor: Actor, profileId: string, mood: string, extra: { sleepHours?: number | null; notes?: string | null } = {}) {
  await assertProfileAccess(actor, profileId, "write");
  if (!["great", "okay", "tired", "stressed", "unwell"].includes(mood)) throw new Error("Invalid check-in");
  const db = await getDb();
  await db.query("insert into check_ins(profile_id, user_id, mood, sleep_hours, notes) values ($1,$2,$3,$4,$5)", [profileId, actor.id, mood, extra.sleepHours ?? null, extra.notes ?? null]);
}

export async function listCheckIns(actor: Actor, profileId: string, days = 30) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  return (await db.query<{ id: string; mood: string; sleep_hours: number | null; created_at: Date }>("select * from check_ins where profile_id = $1 and created_at > now() - ($2 || ' days')::interval order by created_at desc", [profileId, String(days)])).rows;
}

// ---------------------------------------------------------------------------
// Doctor-authored content (read side for patients)
// ---------------------------------------------------------------------------
export interface DoctorInstruction {
  id: string;
  profile_id: string;
  doctor_id: string;
  doctor_name: string;
  instruction_type: string;
  instruction: string;
  reason: string | null;
  topics: string[];
  version: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function listDoctorInstructions(actor: Actor, profileId: string, includeInactive = false) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  return (
    await db.query<DoctorInstruction>(
      `select i.*, d.full_name as doctor_name from doctor_patient_instructions i join doctors d on d.id = i.doctor_id
       where i.profile_id = $1 ${includeInactive ? "" : "and i.active"} order by i.created_at desc`,
      [profileId],
    )
  ).rows;
}

export async function listDoctorNotes(actor: Actor, profileId: string) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  return (
    await db.query<{ id: string; note: string; created_at: Date; doctor_name: string; review_id: string | null }>(
      "select n.*, d.full_name as doctor_name from doctor_notes n join doctors d on d.id = n.doctor_id where n.profile_id = $1 order by n.created_at desc",
      [profileId],
    )
  ).rows;
}
