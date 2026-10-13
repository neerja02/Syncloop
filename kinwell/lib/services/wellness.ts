import "server-only";
import { getDb } from "@/lib/database/client";
import { assertProfileAccess } from "@/lib/security/access";
import type { Actor } from "@/types/domain";

export interface WellnessCategory {
  key: string;
  label: string;
  score: number;
  explanation: string;
}

/**
 * Optional wellness *organisation* score built only from explicit, measurable inputs (sleep logs, steps,
 * check-ins, goals, logging consistency, preventive care). It is not a diagnosis or a risk estimate.
 * Categories without data are left out rather than guessed.
 */
export async function wellnessScore(actor: Actor, profileId: string): Promise<{ overall: number | null; categories: WellnessCategory[] }> {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  const cats: WellnessCategory[] = [];
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const sleep = (await db.query<{ avg: number | null; n: number }>("select avg(value) as avg, count(*) as n from measurements where profile_id = $1 and measurement_type = 'sleep_duration' and measured_at > now() - interval '7 days'", [profileId])).rows[0]!;
  if (sleep.n >= 3 && sleep.avg != null) cats.push({ key: "sleep", label: "Sleep", score: clamp((sleep.avg / 7.5) * 100), explanation: `Average ${sleep.avg.toFixed(1)} h over ${sleep.n} nights, compared with a 7.5 h goal.` });

  const steps = (await db.query<{ avg: number | null; n: number }>("select avg(value) as avg, count(*) as n from measurements where profile_id = $1 and measurement_type = 'steps' and measured_at > now() - interval '7 days'", [profileId])).rows[0]!;
  if (steps.n >= 3 && steps.avg != null) cats.push({ key: "activity", label: "Activity", score: clamp((steps.avg / 8000) * 100), explanation: `Average ${Math.round(steps.avg).toLocaleString("en-IN")} steps a day, compared with 8,000.` });

  const moods = (await db.query<{ mood: string }>("select mood from check_ins where profile_id = $1 and created_at > now() - interval '14 days'", [profileId])).rows;
  if (moods.length >= 2) {
    const map: Record<string, number> = { great: 100, okay: 75, tired: 55, stressed: 45, unwell: 30 };
    cats.push({ key: "wellbeing", label: "Wellbeing check-ins", score: clamp(moods.reduce((s, m) => s + (map[m.mood] ?? 60), 0) / moods.length), explanation: `Based on ${moods.length} check-ins in the last two weeks.` });
  }

  const goals = (await db.query<{ avg: number | null; n: number }>("select avg(progress) as avg, count(*) as n from health_goals where profile_id = $1 and status <> 'paused'", [profileId])).rows[0]!;
  if (goals.n > 0 && goals.avg != null) cats.push({ key: "goals", label: "Health goals", score: clamp(goals.avg), explanation: `Average progress across ${goals.n} goal${goals.n === 1 ? "" : "s"}.` });

  const days = (await db.query<{ n: number }>("select count(distinct measured_at::date) as n from measurements where profile_id = $1 and source <> 'device' and measured_at > now() - interval '14 days'", [profileId])).rows[0]!.n;
  const tracking = (await db.query<{ n: number }>("select count(*) as n from measurements where profile_id = $1 and source <> 'device'", [profileId])).rows[0]!.n;
  if (tracking > 0) cats.push({ key: "measurements", label: "Measurements", score: clamp((days / 10) * 100), explanation: `Readings logged on ${days} of the last 14 days.` });

  const conditions = (await db.query<{ name: string }>("select name from health_conditions where profile_id = $1 and status <> 'resolved'", [profileId])).rows;
  const checks: { ok: boolean; label: string }[] = [];
  const recentReport = (await db.query("select 1 from reports where profile_id = $1 and coalesce(report_date, created_at::date) > current_date - 365 limit 1", [profileId])).rows.length > 0;
  checks.push({ ok: recentReport, label: "a report in the last year" });
  if (conditions.some((c) => /diabet/i.test(c.name))) checks.push({ ok: (await db.query("select 1 from report_results where profile_id = $1 and canonical_name = 'HbA1c' and status = 'confirmed' and coalesce(observed_at, created_at::date) > current_date - 182 limit 1", [profileId])).rows.length > 0, label: "HbA1c in the last 6 months" });
  if (conditions.some((c) => /hypertension|blood pressure/i.test(c.name))) checks.push({ ok: (await db.query("select 1 from measurements where profile_id = $1 and measurement_type = 'blood_pressure' and measured_at > now() - interval '30 days' limit 1", [profileId])).rows.length > 0, label: "blood pressure checked this month" });
  const appt = (await db.query("select 1 from appointments where profile_id = $1 and status in ('completed','confirmed','requested') and starts_at > now() - interval '365 days' limit 1", [profileId])).rows.length > 0;
  checks.push({ ok: appt, label: "a doctor visit in the last year" });
  cats.push({ key: "preventive", label: "Preventive care", score: clamp((checks.filter((c) => c.ok).length / checks.length) * 100), explanation: `${checks.filter((c) => c.ok).length} of ${checks.length}: ${checks.map((c) => `${c.ok ? "✓" : "○"} ${c.label}`).join(", ")}.` });

  const overall = cats.length ? Math.round(cats.reduce((s, c) => s + c.score, 0) / cats.length) : null;
  return { overall, categories: cats };
}
