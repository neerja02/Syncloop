import "server-only";
import { features } from "@/lib/config/features";
import { getDb } from "@/lib/database/client";
import type { SourceTracker } from "../agents/context";

/**
 * Patient Medical Context Service (PRIORITY 3 data). Loads only the slices an agent asks for, so we never send
 * a full medical history to an AI provider. Every load is recorded in the SourceTracker.
 */
export class PatientContextService {
  constructor(
    private profileId: string,
    private tracker: SourceTracker,
  ) {}

  async conditions() {
    this.tracker.section("conditions");
    const db = await getDb();
    return (await db.query<{ id: string; name: string; status: string }>("select id, name, status from health_conditions where profile_id = $1 and status <> 'resolved'", [this.profileId])).rows;
  }

  async hasCondition(pattern: RegExp) {
    return (await this.conditions()).some((c) => pattern.test(c.name));
  }

  async allergies() {
    this.tracker.section("allergies");
    const db = await getDb();
    return (await db.query<{ substance: string; reaction: string | null; severity: string | null }>("select substance, reaction, severity from allergies where profile_id = $1", [this.profileId])).rows;
  }

  async activeMedications() {
    this.tracker.section("medications");
    const db = await getDb();
    const rows = (
      await db.query<{ id: string; name: string; generic_name: string | null; strength: string | null; frequency: string | null; instructions: string | null; prescribing_doctor: string | null; reason: string | null }>(
        "select id, name, generic_name, strength, frequency, instructions, prescribing_doctor, reason from medications where profile_id = $1 and status = 'active' order by name",
        [this.profileId],
      )
    ).rows;
    for (const r of rows) if (!this.tracker.medications.some((m) => m.id === r.id)) this.tracker.medications.push({ id: r.id, name: r.name });
    return rows;
  }

  async measurements(type: string, opts: { days?: number; limit?: number; context?: string } = {}) {
    this.tracker.section(`measurements:${type}`);
    const db = await getDb();
    const args: unknown[] = [this.profileId, type, new Date(Date.now() - (opts.days ?? 90) * 86400000), opts.limit ?? 30];
    let ctx = "";
    if (opts.context) {
      args.push(opts.context);
      ctx = `and context = $${args.length}`;
    }
    return (
      await db.query<{ id: string; value: number; secondary_value: number | null; unit: string; context: string | null; measured_at: Date; source: string }>(
        `select id, value, secondary_value, unit, context, measured_at, source from measurements where profile_id = $1 and measurement_type = $2 and measured_at >= $3 ${ctx} order by measured_at desc limit $4`,
        args,
      )
    ).rows;
  }

  async labHistory(canonical: string, limit = 5) {
    this.tracker.section(`lab:${canonical}`);
    const db = await getDb();
    return (
      await db.query<{ value: number; unit: string; observed_at: string | null; report_id: string; title: string }>(
        `select rr.value, rr.unit, rr.observed_at, rr.report_id, r.title from report_results rr join reports r on r.id = rr.report_id
         where rr.profile_id = $1 and rr.canonical_name = $2 and rr.status = 'confirmed' and rr.value is not null order by rr.observed_at desc nulls last, rr.created_at desc limit $3`,
        [this.profileId, canonical, limit],
      )
    ).rows;
  }

  async recentReports(limit = 5, type?: string) {
    this.tracker.section("reports");
    const db = await getDb();
    const args: unknown[] = [this.profileId, limit];
    let t = "";
    if (type) {
      args.push(type);
      t = "and document_type = $3";
    }
    return (
      await db.query<{ id: string; title: string; status: string; report_date: string | null; summary: string | null; doctor_notes: string | null; doctor_reviewed_at: Date | null; created_at: Date }>(
        `select id, title, status, report_date, summary, doctor_notes, doctor_reviewed_at, created_at from reports where profile_id = $1 ${t} order by coalesce(report_date, created_at::date) desc limit $2`,
        args,
      )
    ).rows;
  }

  /** PRIORITY 1: patient-specific instructions from the assigned doctor. */
  async doctorInstructions(topics: string[] = []) {
    // Doctor-authored instructions come from the doctor portal, which is outside the patient-only MVP.
    if (!features.doctorPortal) return [];
    this.tracker.section("doctor_instructions");
    const db = await getDb();
    const rows = (
      await db.query<{ id: string; instruction_type: string; instruction: string; reason: string | null; topics: string[]; version: number; created_at: Date; doctor_name: string }>(
        `select i.id, i.instruction_type, i.instruction, i.reason, i.topics, i.version, i.created_at, d.full_name as doctor_name
         from doctor_patient_instructions i join doctors d on d.id = i.doctor_id
         join profiles p on p.id = i.profile_id
         join doctor_family_assignments a on a.family_id = p.family_id and a.doctor_id = i.doctor_id and a.status = 'active'
         where i.profile_id = $1 and i.active order by i.created_at desc`,
        [this.profileId],
      )
    ).rows;
    const relevant = topics.length ? rows.filter((r) => !r.topics.length || r.topics.some((t) => topics.includes(t)) || topics.some((t) => r.instruction.toLowerCase().includes(t.replace(/_/g, " ")))) : rows;
    for (const r of relevant) if (!this.tracker.doctorInstructions.some((x) => x.id === r.id)) this.tracker.doctorInstructions.push({ id: r.id, type: r.instruction_type, version: r.version });
    return relevant;
  }

  async doctorNotes(limit = 3) {
    this.tracker.section("doctor_notes");
    const db = await getDb();
    return (await db.query<{ note: string; created_at: Date; doctor_name: string }>("select n.note, n.created_at, d.full_name as doctor_name from doctor_notes n join doctors d on d.id = n.doctor_id where n.profile_id = $1 order by n.created_at desc limit $2", [this.profileId, limit])).rows;
  }

  async recentCheckIns(days = 7) {
    this.tracker.section("check_ins");
    const db = await getDb();
    return (await db.query<{ mood: string; sleep_hours: number | null; created_at: Date }>("select mood, sleep_hours, created_at from check_ins where profile_id = $1 and created_at > now() - ($2 || ' days')::interval order by created_at desc", [this.profileId, String(days)])).rows;
  }

  async goals() {
    this.tracker.section("goals");
    const db = await getDb();
    return (await db.query<{ title: string; category: string; progress: number }>("select title, category, progress from health_goals where profile_id = $1 and status = 'active'", [this.profileId])).rows;
  }
}
