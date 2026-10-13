import "server-only";
import { getDb } from "@/lib/database/client";
import { formatDate } from "@/lib/utils/format";
import { trendDirection } from "@/lib/clinical/report-extraction";
import { PatientContextService } from "../services/patient-context";
import { baseResponse, cardId, type AgentContext, type AgentResult } from "./context";
import type { ChatCard } from "../types";

/** Questions about a person's own history, answered from their records (never from general knowledge). */
export function isHistoryQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bwhen (did|was|were) (my|her|his|their|the|our|\w+'s)\b/.test(t) ||
    /\b(last|previous|past) (\d+|two|three|four|five|few) .*(results?|readings?|reports?|tests?)\b/.test(t) ||
    /\bshow (me )?(my|her|his|\w+'s) (last|previous|past|recent)\b/.test(t) ||
    /\bis (my|her|his|\w+'s) .*(improving|getting better|going down|going up|changed)\b/.test(t) ||
    /\bhas (my|her|his|\w+'s) .*(weight|sugar|bp|blood pressure|cholesterol|hba1c) changed\b/.test(t) ||
    /\b(history of|timeline of) (my|her|his|\w+'s)\b/.test(t)
  );
}

const LABS: [RegExp, string][] = [
  [/hba1c|a1c/, "HbA1c"],
  [/\bldl\b/, "LDL cholesterol"],
  [/\bhdl\b/, "HDL cholesterol"],
  [/triglycer/, "Triglycerides"],
  [/cholesterol|lipid/, "Total cholesterol"],
  [/tsh|thyroid/, "TSH"],
  [/haemoglobin|hemoglobin|\bhb\b/, "Haemoglobin"],
  [/creatinine|kidney/, "Creatinine"],
  [/vitamin d/, "Vitamin D"],
];

const WORD_NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, few: 3 };

export async function historyAgent(ctx: AgentContext): Promise<AgentResult> {
  const t = ctx.message.toLowerCase();
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const who = ctx.profile.relationship === "self" ? "your" : `${ctx.profile.display_name}'s`;
  const nMatch = t.match(/\b(last|previous|past) (\d+|two|three|four|five|few)\b/);
  const n = Math.min(10, nMatch ? (Number(nMatch[2]) || WORD_NUM[nMatch[2]!] || 3) : 5);
  const done = (text: string, cards: ChatCard[] = []): AgentResult => ({ agent: "HistoryAgent", text, cards, lockText: true, response: baseResponse(ctx, { intent: "reports", summary: "History question" }) });

  // 1) Lab results over time ("my last three cholesterol results", "is my HbA1c improving?")
  const lab = LABS.find(([re]) => re.test(t))?.[1];
  if (lab) {
    const rows = await patient.labHistory(lab, n);
    if (!rows.length) return done(`I couldn't find any ${lab} results in ${who} reports yet. Upload a report and I'll keep track of it.`);
    const unit = rows[0]!.unit === "%" ? "%" : ` ${rows[0]!.unit}`;
    const trend = rows.length > 1 ? trendDirection(lab, rows.map((r) => Number(r.value))) : null; // newest first
    const list = rows.map((r) => `• ${r.value}${unit}${r.observed_at ? ` — ${formatDate(r.observed_at)}` : ""}`).join("\n");
    return done(`Here ${rows.length === 1 ? "is" : "are"} ${who} last ${rows.length === 1 ? "" : `${rows.length} `}${lab} result${rows.length === 1 ? "" : "s"}.${trend ? ` ${trend.label}.` : ""}`, [
      { id: cardId(), type: "trend", measurementType: lab, label: `${lab} · ${ctx.profile.display_name}`, unit: rows[0]!.unit, points: [...rows].reverse().map((r) => ({ t: new Date(r.observed_at ?? Date.now()).toISOString(), v: Number(r.value) })), summary: trend?.label ?? "" },
      { id: cardId(), type: "info", tone: "info", title: `${lab} results`, body: list },
    ]);
  }

  // 2) Readings over time (sugar, blood pressure, weight)
  const reading = /\b(sugar|glucose)\b/.test(t) ? "blood_glucose" : /\b(bp|blood pressure)\b/.test(t) ? "blood_pressure" : /\bweight\b/.test(t) ? "weight" : null;
  if (reading) {
    const rows = await patient.measurements(reading, { days: 365, limit: Math.max(n, 10) });
    const label = reading === "blood_glucose" ? "blood sugar" : reading === "blood_pressure" ? "blood pressure" : "weight";
    if (!rows.length) {
      const w = reading === "weight" && ctx.profile.weight_kg ? ` The profile says ${ctx.profile.weight_kg} kg, but there are no dated weight readings to compare.` : "";
      return done(`I couldn't find any ${label} readings for ${ctx.profile.relationship === "self" ? "you" : ctx.profile.display_name} yet.${w}`);
    }
    const fmt = (r: (typeof rows)[number]) => `${r.value}${r.secondary_value ? `/${r.secondary_value}` : ""} ${r.unit}`;
    const first = rows[rows.length - 1]!;
    const last = rows[0]!;
    const change = rows.length > 1 && reading !== "blood_pressure" ? ` Since ${formatDate(first.measured_at)} it has gone from ${fmt(first)} to ${fmt(last)}.` : "";
    return done(`The latest ${label} reading is ${fmt(last)} (${formatDate(last.measured_at)}).${change}`, [
      { id: cardId(), type: "trend", measurementType: reading, label: `${label.charAt(0).toUpperCase()}${label.slice(1)} · ${ctx.profile.display_name}`, unit: last.unit, points: [...rows].reverse().map((r) => ({ t: new Date(r.measured_at).toISOString(), v: Number(r.value), v2: r.secondary_value == null ? null : Number(r.secondary_value) })), summary: change.trim() },
    ]);
  }

  // 3) Symptoms ("when did my headaches start?", "when was my baby's last fever?")
  const keyword = (t.match(/\b(headache|fever|cough|pain|rash|vomit|diarr|breath|tired|dizz|acidity|palpitation|hair|period|eye|limp|seizure)\w*/) ?? [])[1] ?? (t.match(/\b(?:my|her|his|\w+'s) (?:last )?([a-z]+)\b/) ?? [])[1];
  if (keyword) {
    const db = await getDb();
    const like = `%${keyword}%`;
    const events = (
      await db.query<{ at: Date; what: string; source: string }>(
        `select * from (
           select created_at as at, description as what, 'symptom' as source from symptoms where profile_id = $1 and description ilike $2
           union all select coalesce(answered_at, created_at), 'Check-in: ' || topic, 'check_in' from follow_ups where profile_id = $1 and topic ilike $2
           union all select last_message_at, title, 'chat' from conversations where active_profile_id = $1 and title ilike $2
         ) e order by at`,
        [ctx.profile.id, like],
      )
    ).rows;
    if (!events.length) return done(`I couldn't find anything about "${keyword}" in ${who} saved history. Symptoms are added when you tap Save at the end of a symptom check.`);
    const firstE = events[0]!;
    const lastE = events[events.length - 1]!;
    const asksLast = /\blast\b/.test(t);
    const text = asksLast
      ? `The most recent record about "${keyword}" for ${ctx.profile.relationship === "self" ? "you" : ctx.profile.display_name} is from ${formatDate(lastE.at)} (${lastE.what}).`
      : `The first record about "${keyword}" for ${ctx.profile.relationship === "self" ? "you" : ctx.profile.display_name} is from ${formatDate(firstE.at)} (${firstE.what})${events.length > 1 ? `, and the most recent is from ${formatDate(lastE.at)}` : ""}.`;
    return done(text, [{ id: cardId(), type: "info", tone: "info", title: "From the health timeline", body: [...events].reverse().slice(0, 8).map((e) => `• ${formatDate(e.at)} — ${e.what}`).join("\n") }]);
  }

  return done(`I can look things up in ${who} history — for example "show my last three HbA1c results" or "when did my headaches start?". The full timeline is on the Family page.`);
}
