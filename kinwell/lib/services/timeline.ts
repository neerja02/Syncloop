import "server-only";
import { getDb } from "@/lib/database/client";
import { assertProfileAccess } from "@/lib/security/access";
import type { Actor } from "@/types/domain";

export interface TimelineEvent {
  id: string;
  kind: "report" | "measurement" | "appointment" | "medication" | "condition" | "doctor_note" | "review" | "symptom" | "check_in";
  title: string;
  detail: string | null;
  at: Date;
  href: string | null;
  condition: string | null;
}

/** Longitudinal medical timeline for one profile, with search / type / date-range filters. */
export async function profileTimeline(actor: Actor, profileId: string, f: { q?: string; kinds?: string[]; from?: string; to?: string; limit?: number } = {}) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  const { rows } = await db.query<TimelineEvent>(
    `select * from (
      select id, 'report' as kind, title, summary as detail, coalesce(report_date::timestamptz, created_at) as at, '/reports/' || id as href, document_type as condition from reports where profile_id = $1
      union all
      select id, 'measurement', case measurement_type when 'blood_pressure' then 'Blood pressure ' || value || '/' || secondary_value || ' mmHg' when 'blood_glucose' then 'Blood glucose ' || value || ' mg/dL' else initcap(replace(measurement_type, '_', ' ')) || ' ' || value || ' ' || unit end,
        coalesce(replace(context, '_', ' '), source), measured_at, null, measurement_type from measurements where profile_id = $1 and measurement_type not in ('steps','sleep_duration')
      union all
      select id, 'appointment', 'Doctor visit' || coalesce(' · ' || provider_name, '') || coalesce(' (' || speciality || ')', ''), initcap(status) || coalesce(' · ' || notes, ''), starts_at, null, speciality from appointments where profile_id = $1
      union all
      select id, 'medication', case when status = 'active' then 'Started ' else 'Medicine ' end || name || coalesce(' ' || strength, ''), coalesce(reason, frequency), coalesce(start_date::timestamptz, created_at), null, reason from medications where profile_id = $1
      union all
      select id, 'condition', name, status, coalesce(diagnosed_on::timestamptz, created_at), null, name from health_conditions where profile_id = $1
      union all
      select n.id, 'doctor_note', 'Note from ' || d.full_name, n.note, n.created_at, null, null from doctor_notes n join doctors d on d.id = n.doctor_id where n.profile_id = $1
      union all
      select id, 'review', 'Doctor review ' || replace(status, '_', ' '), question, created_at, case when conversation_id is not null then '/app/chat/' || conversation_id else null end, null from doctor_reviews where profile_id = $1
      union all
      select id, 'symptom', description, null, created_at, case when conversation_id is not null then '/app/chat/' || conversation_id else null end, null from symptoms where profile_id = $1
      union all
      select id, 'check_in', 'Check-in: ' || topic, 'Felt ' || case outcome when 'better' then 'better' when 'same' then 'about the same' when 'worse' then 'worse' else 'new symptoms' end,
        answered_at, case when conversation_id is not null then '/app/chat/' || conversation_id else null end, topic from follow_ups where profile_id = $1 and status = 'done' and outcome is not null
    ) t
    where ($2::text is null or t.title ilike '%' || $2 || '%' or coalesce(t.detail, '') ilike '%' || $2 || '%' or coalesce(t.condition, '') ilike '%' || $2 || '%')
      and ($3::text[] is null or t.kind = any($3::text[]))
      and ($4::date is null or t.at >= $4::date)
      and ($5::date is null or t.at < $5::date + 1)
    order by t.at desc limit $6`,
    [profileId, f.q || null, f.kinds?.length ? f.kinds : null, f.from || null, f.to || null, f.limit ?? 200],
  );
  return rows;
}

/** The patient app's timeline: symptoms, check-ins, readings, medicines, reports, doctor visits and conditions (no doctor-portal items). */
export const PATIENT_TIMELINE_KINDS = ["symptom", "check_in", "measurement", "medication", "report", "appointment", "condition"];
