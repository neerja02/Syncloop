import type { Judge, Person, Profile, ReadingDef, Slot } from "./types";

export const SLOTS: Slot[] = ["Early morning", "Morning", "Afternoon", "Night"];
export const CONDITIONS = ["Diabetes", "High BP", "Cholesterol", "Thyroid", "Heart", "Arthritis", "Kidney", "Asthma"];
export const FREQ_ORDER = ["Daily", "Weekly", "Monthly", "Every 3 months", "Every 6 months", "Every 12 months"];

/** What each condition needs Asha to track, how often, and how she collects it. */
export const CATALOG: Record<string, ReadingDef[]> = {
  "High BP": [{ id: "bp", name: "Blood pressure", unit: "mmHg", freq: "Daily", when: "Morning, on the check-in call", ch: "Call", def: "132/84" }],
  Diabetes: [
    { id: "fbs", name: "Fasting sugar", unit: "mg/dL", freq: "Daily", when: "7:30 am, before tea", ch: "WhatsApp", def: "126" },
    { id: "ppbs", name: "Sugar 2 hrs after lunch", unit: "mg/dL", freq: "Weekly", when: "Saturday, 3:00 pm", ch: "WhatsApp", def: "168" },
    { id: "feet", name: "Feet check (cuts, swelling)", unit: "", freq: "Weekly", when: "Sunday health check", ch: "Call" },
    { id: "hba1c", name: "HbA1c blood test", unit: "%", freq: "Every 3 months", when: "Before diabetes check-up", ch: "Lab" },
  ],
  Cholesterol: [{ id: "lipid", name: "Lipid profile", unit: "", freq: "Every 6 months", when: "Before heart/BP check-up", ch: "Lab" }],
  Thyroid: [{ id: "tsh", name: "TSH blood test", unit: "mIU/L", freq: "Every 3 months", when: "Before thyroid check-up", ch: "Lab" }],
  Heart: [
    { id: "pulse", name: "Pulse", unit: "bpm", freq: "Daily", when: "With the BP reading", ch: "Call", def: "76" },
    { id: "ecg", name: "ECG", unit: "", freq: "Every 12 months", when: "Before heart check-up", ch: "Lab" },
  ],
  Arthritis: [{ id: "pain", name: "Joint pain score (0–10)", unit: "/10", freq: "Weekly", when: "Sunday health check", ch: "Call", def: "4" }],
  Kidney: [{ id: "creat", name: "Creatinine blood test", unit: "mg/dL", freq: "Every 3 months", when: "Before kidney check-up", ch: "Lab" }],
  Asthma: [{ id: "breath", name: "Breathlessness check", unit: "", freq: "Daily", when: "On the check-in call", ch: "Call" }],
  _all: [
    { id: "weight", name: "Weight", unit: "kg", freq: "Monthly", when: "1st Sunday of the month", ch: "Call", def: "72.4" },
    { id: "weekly", name: "Weekly health check", unit: "", freq: "Weekly", when: "Sunday 10:00 am", ch: "Call" },
  ],
};

export function buildPlan(pr: Profile): ReadingDef[] {
  const seen = new Set<string>();
  const out: ReadingDef[] = [];
  [...pr.conditions, "_all"].forEach((c) =>
    (CATALOG[c] || []).forEach((r) => {
      if (seen.has(r.id)) return;
      seen.add(r.id);
      const x = { ...r };
      if (pr.planCh?.[r.id]) x.ch = pr.planCh[r.id];
      if (r.id === "weekly") x.when = pr.checkin.weekly;
      out.push(x);
    }),
  );
  return out.sort((a, b) => FREQ_ORDER.indexOf(a.freq) - FREQ_ORDER.indexOf(b.freq));
}

/** Readings a person can type in (as opposed to lab tests). */
export const READ: Record<string, { name: string; unit: string; def: string }> = {
  bp: { name: "Blood pressure", unit: "mmHg", def: "132/84" },
  fbs: { name: "Fasting sugar", unit: "mg/dL", def: "126" },
  ppbs: { name: "Sugar after lunch", unit: "mg/dL", def: "168" },
  weight: { name: "Weight", unit: "kg", def: "72.4" },
  pain: { name: "Joint pain score", unit: "/10", def: "4" },
  pulse: { name: "Pulse", unit: "bpm", def: "76" },
};

export interface JudgeResult {
  j: Judge;
  s?: number;
  d?: number;
  n?: number;
}

export function judge(rid: string, v: string): JudgeResult | null {
  if (rid === "bp") {
    const m = String(v).match(/(\d{2,3})\D+(\d{2,3})/);
    if (!m) return null;
    const s = +m[1], d = +m[2];
    if (s >= 170 || d >= 105) return { j: "bad", s, d };
    if (s >= 140 || d >= 90) return { j: "warn", s, d };
    if (s < 95) return { j: "low", s, d };
    return { j: "good", s, d };
  }
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  if (rid === "fbs") return { j: n < 70 ? "low" : n >= 250 ? "bad" : n > 130 ? "warn" : "good", n };
  if (rid === "ppbs") return { j: n < 70 ? "low" : n >= 300 ? "bad" : n > 180 ? "warn" : "good", n };
  if (rid === "pain") return { j: n >= 7 ? "warn" : "good", n };
  if (rid === "pulse") return { j: n > 110 || n < 50 ? "warn" : "good", n };
  return { j: "good", n };
}

export const valueText = (rid: string, r: JudgeResult) => (rid === "bp" ? `${r.s}/${r.d}` : String(r.n));

export function docFor(p: Person, re: RegExp): string {
  return (p.pr.doctors.find((d) => re.test(d.sp)) || p.pr.doctors[0] || { name: "doctor sahab" }).name;
}

/** Asha's reply to a reading, for chat (`chat`), call captions (`show`) and Hindi voice (`say`). */
export function readingReply(p: Person, rid: string, res: JudgeResult) {
  const r = READ[rid];
  const v = valueText(rid, res);
  const cg = p.pr.cg.name || "family";
  if (res.j === "good")
    return { chat: `${r.name} <b>${v}</b> 👍 Bilkul theek hai. Note kar liya.`, show: `${v}, bilkul theek hai. Main note kar leti hoon.`, say: `${v}, बिल्कुल ठीक है। मैं नोट कर लेती हूँ।`, alert: false };
  if (res.j === "warn") {
    const tip = rid === "bp" ? "Namak thoda kam rakhiye, aur 10 minute aaraam se baith ke dobara naapiye." : rid === "pain" ? "Shaam ko garam sek kijiye, seedhiyan kam chadhiye." : "Aaj meetha aur chawal thoda kam rakhiye, khaane ke baad 15 minute tehal lijiye.";
    const doc = rid === "bp" ? docFor(p, /BP|Heart/i) : docFor(p, /Diab/i);
    return {
      chat: `${r.name} <b>${v}</b> thoda zyada hai. ${tip} Agar 3 din tak aisa raha toh ${doc} ko dikhayenge.`,
      show: `${v} thoda zyada hai. ${tip}`,
      say: `${v} थोड़ा ज़्यादा है। चिंता मत कीजिए। ${rid === "bp" ? "नमक थोड़ा कम रखिए और दस मिनट आराम से बैठ के दोबारा नापिए" : "मीठा थोड़ा कम रखिए और खाने के बाद टहल लीजिए"}।`,
      alert: false,
    };
  }
  if (res.j === "low")
    return {
      chat: `${r.name} <b>${v}</b> kam hai. Abhi ek chammach cheeni ya glucose paani mein lijiye, aur 15 minute baad dobara check kijiye. ${cg} ko bata rahi hoon.`,
      show: `${v} kam hai. Abhi ek chammach cheeni paani mein lijiye.`,
      say: `${v} कम है। अभी एक चम्मच चीनी पानी में लीजिए, और पंद्रह मिनट बाद दोबारा चेक कीजिए।`,
      alert: true,
    };
  return {
    chat: `${r.name} <b>${v}</b> bahut zyada hai. Aaraam se baith jaiye, ghabraiye mat. Agar sar mein tez dard, chakkar, seene mein dard ya saans phool rahi ho toh <b>turant 112</b> pe call kijiye.`,
    show: `${v} bahut zyada hai. Aaraam se baith jaiye. Main ${cg} ko abhi bata rahi hoon.`,
    say: `${v} बहुत ज़्यादा है। आराम से बैठ जाइए, घबराइए मत। मैं ${cg} को अभी बता रही हूँ।`,
    alert: true,
  };
}

export const PROBLEMS = {
  stomach: {
    chip: "Pet thoda kharab hai", text: "pet kharab tha", chat: "kal aapka pet thoda kharab tha", say: "पेट खराब था",
    tips: [["Jeera ka garam paani", "Khaane ke baad, 2–3 baar"], ["Raat ko halki khichdi", "Tala hua aur masaledar nahi"], ["Khaali pet chai nahi", "Pehle ek biscuit ya kela"]],
    doc: /Diab|Gen/i,
  },
  knee: {
    chip: "Ghutne mein dard hai", text: "ghutne mein dard tha", chat: "kal aapke ghutne mein dard tha", say: "घुटने में दर्द था",
    tips: [["Shaam ko 15 minute garam sek", "Towel mein garam paani ki bottle"], ["Seedhiyon pe railing pakad ke", "Ek-ek step dheere"], ["Halki stretching", "Subah aur shaam 5 minute"]],
    doc: /Ortho/i,
  },
  sleep: {
    chip: "Neend nahi aayi", text: "neend theek se nahi aayi thi", chat: "kal raat aapko neend theek se nahi aayi thi", say: "नींद ठीक से नहीं आई थी",
    tips: [["Shaam 6 baje ke baad chai nahi", ""], ["Raat ko ek glass garam doodh", ""], ["Sone se aadha ghanta pehle TV band", ""]],
    doc: /Gen/i,
  },
} as const;
export type ProblemKey = keyof typeof PROBLEMS;
