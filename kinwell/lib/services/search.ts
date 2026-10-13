import "server-only";
import { getDb } from "@/lib/database/client";
import { assertFamilyAccess } from "@/lib/security/access";
import type { Actor } from "@/types/domain";

export interface SearchHit {
  kind: "chat" | "report" | "medicine" | "measurement" | "condition" | "doctor_note";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  date: Date | string | null;
}

/** Global search across chats, reports, medicines, measurements, conditions and doctor notes — scoped to the actor's family. */
export async function globalSearch(actor: Actor, q: string): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 100);
  if (query.length < 2 || !actor.familyId) return [];
  await assertFamilyAccess(actor, actor.familyId);
  const db = await getDb();
  const fam = actor.familyId;
  const like = `%${query}%`;
  const [chats, reports, meds, conds, notes, meas] = await Promise.all([
    db.query<{ id: string; title: string; snippet: string | null; profile: string; at: Date }>(
      `select c.id, c.title, (select m.content from messages m where m.conversation_id = c.id and (m.content ilike $2 or m.search @@ plainto_tsquery('english', $3)) order by m.created_at desc limit 1) as snippet, p.display_name as profile, c.last_message_at as at
       from conversations c join profiles p on p.id = c.active_profile_id
       where c.family_id = $1 and (c.title ilike $2 or exists (select 1 from messages m where m.conversation_id = c.id and (m.content ilike $2 or m.search @@ plainto_tsquery('english', $3))))
       order by c.last_message_at desc limit 8`,
      [fam, like, query],
    ),
    db.query<{ id: string; title: string; profile: string; at: string | null }>(
      `select r.id, r.title, p.display_name as profile, coalesce(r.report_date::text, r.created_at::text) as at from reports r join profiles p on p.id = r.profile_id
       where r.family_id = $1 and (r.title ilike $2 or r.search @@ plainto_tsquery('english', $3)) order by r.created_at desc limit 8`,
      [fam, like, query],
    ),
    db.query<{ id: string; name: string; strength: string | null; profile: string; profile_id: string; status: string }>(
      `select m.id, m.name, m.strength, p.display_name as profile, p.id as profile_id, m.status from medications m join profiles p on p.id = m.profile_id
       where p.family_id = $1 and (m.name ilike $2 or m.generic_name ilike $2 or m.reason ilike $2) limit 8`,
      [fam, like],
    ),
    db.query<{ id: string; name: string; profile: string; profile_id: string; status: string }>(
      `select c.id, c.name, p.display_name as profile, p.id as profile_id, c.status from health_conditions c join profiles p on p.id = c.profile_id where p.family_id = $1 and c.name ilike $2 limit 8`,
      [fam, like],
    ),
    db.query<{ id: string; note: string; profile: string; profile_id: string; at: Date }>(
      `select n.id, n.note, p.display_name as profile, p.id as profile_id, n.created_at as at from doctor_notes n join profiles p on p.id = n.profile_id where p.family_id = $1 and n.note ilike $2 order by n.created_at desc limit 8`,
      [fam, like],
    ),
    /^(sugar|glucose|bp|blood pressure|weight|hba1c|sleep|steps|heart)/i.test(query)
      ? db.query<{ id: string; measurement_type: string; value: number; secondary_value: number | null; unit: string; profile: string; profile_id: string; at: Date }>(
          `select m.id, m.measurement_type, m.value, m.secondary_value, m.unit, p.display_name as profile, p.id as profile_id, m.measured_at as at from measurements m join profiles p on p.id = m.profile_id
           where p.family_id = $1 and m.measurement_type = $2 order by m.measured_at desc limit 6`,
          [fam, /bp|pressure/i.test(query) ? "blood_pressure" : /weight/i.test(query) ? "weight" : /hba1c/i.test(query) ? "hba1c" : /sleep/i.test(query) ? "sleep_duration" : /steps/i.test(query) ? "steps" : /heart/i.test(query) ? "heart_rate" : "blood_glucose"],
        )
      : Promise.resolve({ rows: [] as { id: string; measurement_type: string; value: number; secondary_value: number | null; unit: string; profile: string; profile_id: string; at: Date }[] }),
  ]);
  return [
    ...chats.rows.map((c) => ({ kind: "chat" as const, id: c.id, title: c.title, subtitle: `${c.profile}${c.snippet ? " · " + c.snippet.slice(0, 90) : ""}`, href: `/app/chat/${c.id}`, date: c.at })),
    ...reports.rows.map((r) => ({ kind: "report" as const, id: r.id, title: r.title, subtitle: r.profile, href: `/reports/${r.id}`, date: r.at })),
    ...meds.rows.map((m) => ({ kind: "medicine" as const, id: m.id, title: `${m.name}${m.strength ? " " + m.strength : ""}`, subtitle: `${m.profile} · ${m.status}`, href: `/health/medications?profile=${m.profile_id}`, date: null })),
    ...meas.rows.map((m) => ({ kind: "measurement" as const, id: m.id, title: `${m.value}${m.secondary_value ? "/" + m.secondary_value : ""} ${m.unit}`, subtitle: `${m.profile} · ${m.measurement_type.replace(/_/g, " ")}`, href: `/health/measurements?profile=${m.profile_id}&type=${m.measurement_type}`, date: m.at })),
    ...conds.rows.map((c) => ({ kind: "condition" as const, id: c.id, title: c.name, subtitle: `${c.profile} · ${c.status}`, href: `/health/conditions?profile=${c.profile_id}`, date: null })),
    ...notes.rows.map((n) => ({ kind: "doctor_note" as const, id: n.id, title: n.note.slice(0, 80), subtitle: `Doctor note · ${n.profile}`, href: `/family/${n.profile_id}`, date: n.at })),
  ];
}
