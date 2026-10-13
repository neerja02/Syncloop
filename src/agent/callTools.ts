/**
 * What happens in the app when Nia (the ElevenLabs voice agent) calls one of her
 * tools during a live call, plus the dynamic variables sent at the start of a call.
 * Tool names and parameters match the tools configured on the ElevenLabs agent.
 */
import { judge, PROBLEMS, READ, valueText } from "../domain/catalog";
import { buildWeekly, dueToday, has, loggedToday, nextVisit, visitText, type WeeklyAnswers } from "../domain/health";
import type { Person } from "../domain/types";
import { getState } from "../store/useStore";
import { esc, familyNote, logReading, nowStr } from "./flows";

export type CallKind = "daily" | "weekly";

export function buildDynamicVariables(p: Person, kind: CallKind): Record<string, string> {
  const s = getState();
  const pr = p.pr;
  const dueMeds = p.doses.filter((d) => /morning/i.test(d.slot) && d.ch === "Call" && !d.taken).map((d) => `${d.name} ${d.dose} (${d.note || d.slot.toLowerCase()})`);
  const readings =
    kind === "weekly"
      ? `weekly health check: sleep, pain, appetite, mood${has(p, "feet") ? ", feet" : ""}${has(p, "pain") ? ", knee pain score 0-10" : ""}, weight`
      : dueToday(p, s.baseDate, s.day).filter((r) => r.ch === "Call" && READ[r.id] && !loggedToday(p, r.id, s.day)).map((r) => r.name).join(", ");
  const v = nextVisit(p, s.baseDate, s.day);
  const fu = p.followup ? `${p.followup.key ? PROBLEMS[p.followup.key].chat : p.followup.text}${p.followup.advice ? `; Nia suggested: ${p.followup.advice}` : ""}` : "none";
  return {
    patient_name: pr.first || pr.name || "aap",
    relation: pr.rel || "parent",
    age: pr.age || "unknown",
    caregiver_name: pr.cg.name || "family",
    conditions: pr.conditions.join(", ") || "none listed",
    medicines_due: dueMeds.join(", ") || "none",
    readings_due: readings || "none",
    followup: fu,
    next_visit: v && v.days <= 10 ? `${v.d.name} on ${visitText(v.d)}${v.d.tests ? ` (carry ${v.d.tests} report)` : ""}` : "none in next 10 days",
    call_type: kind === "weekly" ? "weekly health check" : "daily check-in",
  };
}

const TYPE_MAP: Record<string, string> = { bp: "bp", fasting_sugar: "fbs", post_meal_sugar: "ppbs", weight: "weight", pulse: "pulse", pain_score: "pain" };

export interface ToolEvent { text: string; tone: "good" | "warn" | "bad" }

export function makeCallTools(personId: string, _kind: CallKind, onEvent: (e: ToolEvent) => void) {
  const person = () => getState().people.find((p) => p.id === personId)!;
  const weekly: WeeklyAnswers = {};

  return {
    log_reading: ({ reading_type, value }: { reading_type: string; value: string }) => {
      try {
        const rid = TYPE_MAP[reading_type] || reading_type;
        if (!READ[rid]) return "invalid reading type";
        if (rid === "weight") weekly.weight = String(value);
        const res = logReading(personId, rid, String(value));
        if (!res) return "invalid value, ask again";
        const v = valueText(rid, res);
        onEvent({ text: `${READ[rid].name} ${v} ${READ[rid].unit}`, tone: res.j === "good" ? "good" : res.j === "warn" ? "warn" : "bad" });
        if (res.j === "bad" || res.j === "low") familyNote(person(), `${READ[rid].name} ${v} on today's call.`);
        return `saved: ${res.j}`;
      } catch {
        return "could not save";
      }
    },
    mark_medicine_taken: ({ medicine_name }: { medicine_name: string }) => {
      try {
        const name = String(medicine_name || "").toLowerCase();
        const p = person();
        const match = p.doses.find((d) => !d.taken && (name.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(name)));
        if (!match) {
          const already = p.doses.find((d) => d.taken && (name.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(name)));
          if (already) return `already taken at ${already.taken}, do not take again`;
          return "not found in today's list";
        }
        const t = nowStr();
        getState().mutate((x) => { const d = x.doses.find((y) => y.id === match.id); if (d) d.taken = t; }, personId);
        onEvent({ text: `${match.name} taken`, tone: "good" });
        return "marked";
      } catch {
        return "could not mark";
      }
    },
    alert_family: ({ severity, reason }: { severity: string; reason: string }) => {
      const p = person();
      getState().push({ t: "note", ic: "!", x: `<b>${severity === "emergency" ? "Emergency" : "Urgent"}:</b> Nia alerted <b>${esc(p.pr.cg.name)}</b> (${esc(p.pr.cg.phone)}): “${esc(reason)}”` }, personId);
      onEvent({ text: `${p.pr.cg.name || "Family"} alerted: ${reason}`, tone: "bad" });
    },
    note_followup: ({ problem, advice }: { problem: string; advice: string }) => {
      getState().mutate((x) => void (x.followup = { text: String(problem), advice: String(advice || "") }), personId);
      onEvent({ text: `Will follow up: ${problem}`, tone: "warn" });
    },
    save_weekly_check: (a: WeeklyAnswers) => {
      try {
        Object.assign(weekly, a);
        if (a.weight) {
          const n = judge("weight", String(a.weight));
          if (n) logReading(personId, "weight", String(a.weight));
        }
        const s = getState();
        const w = buildWeekly(person(), weekly, s.baseDate, s.day);
        s.mutate((x) => void x.weekly.push(w), personId);
        s.push({ t: "card", kind: "weekly", w }, personId);
        s.push({ t: "note", ic: "✓", x: `Weekly summary sent to <b>${esc(person().pr.cg.name || "family")}</b> on WhatsApp.` }, personId);
        onEvent({ text: `Weekly check saved: ${w.verdict}`, tone: "good" });
        return w.verdict;
      } catch {
        return "saved";
      }
    },
  };
}
