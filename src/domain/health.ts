import { dateOf, daysBetween, prettyISO, shortDate } from "./dates";
import type { Doctor, Person, ReadingDef, Tone, WeeklyResult } from "./types";

export const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
export const has = (p: Person, id: string) => p.plan.some((r) => r.id === id);
export const hon = (p: Person) => `${p.pr.first} ji`;

export function dueToday(p: Person, base: string, day: number): ReadingDef[] {
  const wd = dateOf(base, day).getDay();
  return p.plan.filter(
    (r) => r.freq === "Daily" || (r.freq === "Weekly" && ((/Saturday/.test(r.when) && wd === 6) || (/Sunday/.test(r.when) && wd === 0))),
  );
}

export function loggedToday(p: Person, rid: string, day: number) {
  return (p.readings[rid] || []).find((x) => x[0] === day);
}

export function nextVisit(p: Person, base: string, day: number): { d: Doctor; days: number } | null {
  const list = p.pr.doctors
    .filter((d) => d.name && d.date)
    .map((d) => ({ d, days: daysBetween(base, day, d.date) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days);
  return list[0] || null;
}

export const visitText = (d: Doctor) => (d.date ? `${prettyISO(d.date)}${d.time ? `, ${d.time}` : ""}` : "");

export interface Status { k: string; s: Tone; t: string; d: string }

export function healthStatus(p: Person): Status[] {
  const out: Status[] = [];
  const bp = (p.readings.bp || []).slice(-7);
  const fbs = (p.readings.fbs || []).slice(-7);
  if (bp.length) {
    const s = Math.round(avg(bp.map((x) => x[1]))), d = Math.round(avg(bp.map((x) => x[2] ?? 0)));
    const ok = s < 140 && d < 90;
    out.push({ k: "Blood pressure", s: ok ? "good" : s >= 160 ? "bad" : "warn", t: ok ? "On track" : "High", d: `7-day average ${s}/${d}` });
  }
  if (fbs.length) {
    const a = Math.round(avg(fbs.map((x) => x[1])));
    out.push({ k: "Fasting sugar", s: a <= 130 ? "good" : "warn", t: a <= 130 ? "On track" : "A bit high", d: `7-day average ${a} mg/dL` });
  }
  Object.values(p.labs).forEach((l) => {
    const last = l.pts[l.pts.length - 1][1], prev = l.pts[l.pts.length - 2]?.[1];
    out.push({ k: l.name, s: last <= l.target || (prev !== undefined && last < prev) ? "good" : "warn", t: prev === undefined ? "Logged" : last < prev ? "Improving" : last > prev ? "Worse" : "Same", d: `${prev ?? "—"} → ${last} ${l.unit}` });
  });
  const [a, t] = p.adherence;
  if (t) out.push({ k: "Medicines", s: a / t >= 0.9 ? "good" : "warn", t: `${Math.round((a / t) * 100)}% on time`, d: `${a} of ${t} doses last week` });
  if (p.followup) out.push({ k: "Watching", s: "warn", t: p.followup.text.replace(/ tha$| thi$/, ""), d: "Asha follows up daily" });
  const w = (p.readings.weight || []).slice(-1)[0];
  if (w) out.push({ k: "Weight", s: "same", t: "Steady", d: `${w[1]} kg` });
  return out;
}

export function healthSummary(p: Person, st: Status[]): string {
  // Lower-case ordinary words ("Blood pressure"), keep acronyms ("HbA1c", "TSH").
  const name = (k: string) => (/^[A-Z][a-z ]+$/.test(k) ? k.toLowerCase() : k);
  const good = st.filter((s) => s.s === "good").map((s) => name(s.k));
  const watch = st.filter((s) => s.s === "warn" || s.s === "bad").map((s) => (s.k === "Watching" ? s.t : name(s.k)));
  return `${p.pr.first} ji ${good.length >= watch.length ? "is doing well overall" : "needs a little attention this week"}. ${good.length ? `${good.slice(0, 3).join(", ")} ${good.length > 1 ? "are" : "is"} on track.` : ""} ${watch.length ? `Watching: ${watch.join(", ")}.` : ""}`.trim();
}

export interface WeeklyAnswers { sleep?: string; pain?: string; appetite?: string; mood?: string; feet?: string; weight?: string }

const ANS: Record<string, { label: string; tone: Tone; tag: string }> = {
  good: { label: "Fine", tone: "good", tag: "Good" }, okay: { label: "So-so", tone: "same", tag: "Okay" }, poor: { label: "Not good", tone: "warn", tag: "Watch" },
  none: { label: "None", tone: "good", tag: "Good" }, some: { label: "Some", tone: "same", tag: "Okay" }, a_lot: { label: "A lot", tone: "warn", tag: "Watch" },
  normal: { label: "Normal", tone: "good", tag: "Good" }, low: { label: "Low", tone: "warn", tag: "Watch" },
  happy: { label: "Happy", tone: "good", tag: "Good" }, fine: { label: "Fine", tone: "good", tag: "Good" }, problem: { label: "Problem", tone: "warn", tag: "Watch" },
};

export function buildWeekly(p: Person, ans: WeeklyAnswers, base: string, day: number): WeeklyResult {
  const rows: [string, string, Tone, string][] = [];
  const [a, t] = p.adherence;
  if (t) rows.push(["Medicines", `${a} of ${t} doses`, a / t >= 0.9 ? "good" : "warn", a / t >= 0.9 ? "On time" : "Missed some"]);
  const bp = (p.readings.bp || []).slice(-7), fbs = (p.readings.fbs || []).slice(-7);
  if (bp.length) {
    const s = Math.round(avg(bp.map((x) => x[1]))), d = Math.round(avg(bp.map((x) => x[2] ?? 0)));
    rows.push(["BP average", `${s}/${d}`, s < 140 && d < 90 ? "good" : "warn", s < 140 && d < 90 ? "On track" : "High"]);
  }
  if (fbs.length) {
    const x = Math.round(avg(fbs.map((v) => v[1])));
    rows.push(["Fasting sugar avg", `${x} mg/dL`, x <= 130 ? "good" : "warn", x <= 130 ? "On track" : "A bit high"]);
  }
  const moodMap: Record<string, string> = { okay: "okay", low: "low" };
  ([["Sleep", ans.sleep], ["Pain", ans.pain], ["Appetite", ans.appetite], ["Mood", ans.mood ? moodMap[ans.mood] ?? ans.mood : undefined], ["Feet", ans.feet === "not_asked" ? undefined : ans.feet]] as [string, string | undefined][]).forEach(([k, v]) => {
    if (!v) return;
    const m = ANS[v] || { label: v, tone: "same" as Tone, tag: "Okay" };
    rows.push([k, m.label, m.tone, m.tag]);
  });
  const pain = (p.readings.pain || []).find((x) => x[0] === day);
  if (pain) rows.push(["Knee pain score", `${pain[1]}/10`, pain[1] >= 7 ? "warn" : "good", pain[1] >= 7 ? "High" : "Manageable"]);
  const w = (p.readings.weight || []).slice(-2);
  if (w.length) rows.push(["Weight", `${w[w.length - 1][1]} kg`, "same", w.length > 1 ? (w[1][1] < w[0][1] ? "Down a little" : "Steady") : "Logged"]);
  const bad = rows.filter((r) => r[2] === "warn").length;
  return { date: `Week ending ${shortDate(base, day)}`, rows, verdict: bad === 0 ? "Better than last week" : bad <= 1 ? "Same as last week, mostly fine" : "Needs attention this week" };
}
