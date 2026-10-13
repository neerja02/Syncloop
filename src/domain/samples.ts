import { buildPlan, SLOTS } from "./catalog";
import { isoPlus } from "./dates";
import type { Dose, Lab, Person, Profile, ReadingLog, Report } from "./types";

export const EMPTY_PROFILE: Profile = {
  first: "", name: "", rel: "", age: "", gender: "", lang: "Hinglish", phone: "",
  cg: { name: "", rel: "", phone: "" },
  conditions: [], allergies: "", history: "",
  doctors: [{ name: "", sp: "", date: "", time: "", tests: "" }],
  meds: [],
  checkin: { call: "8:30 am", medMorning: "Call", medNight: "WhatsApp", weekly: "Sunday 10:00 am", alerts: ["missed", "range", "noanswer"] },
  planCh: {},
};

/** Demo people. Doctor dates are relative to the day the demo starts, so they always look upcoming. */
export function sampleProfile(key: "ramesh" | "kamla", base: string): Profile {
  if (key === "ramesh")
    return {
      first: "Ramesh", name: "Ramesh Sharma", rel: "Papa", age: "72", gender: "Male", lang: "Hinglish", phone: "98140 23456",
      cg: { name: "Neha", rel: "Daughter", phone: "98722 11890" },
      conditions: ["Diabetes", "High BP", "Cholesterol", "Arthritis"],
      allergies: "Sulfa medicines",
      history: "Knee pain in both knees since 2023, left is worse. Gallbladder removed in 2015. Does not smoke.",
      doctors: [
        { name: "Dr. Anil Mehta", sp: "Diabetes", date: isoPlus(base, 8), time: "10:30 am", tests: "HbA1c" },
        { name: "Dr. Simran Kaur", sp: "Heart & BP", date: isoPlus(base, 22), time: "11:00 am", tests: "Lipid profile" },
        { name: "Dr. Harpreet Gill", sp: "Orthopedic (knee)", date: "", time: "", tests: "" },
      ],
      meds: [
        { name: "Metformin", dose: "500 mg", times: ["Morning", "Night"], note: "Sugar · after food", dr: "Dr. Anil Mehta" },
        { name: "Amlodipine", dose: "5 mg", times: ["Morning"], note: "BP", dr: "Dr. Simran Kaur" },
        { name: "Atorvastatin", dose: "10 mg", times: ["Night"], note: "Cholesterol · after dinner", dr: "Dr. Simran Kaur" },
      ],
      checkin: { call: "8:30 am", medMorning: "Call", medNight: "WhatsApp", weekly: "Sunday 10:00 am", alerts: ["missed", "range", "noanswer"] },
      planCh: {},
    };
  return {
    first: "Kamla", name: "Kamla Sharma", rel: "Mummy", age: "68", gender: "Female", lang: "Hinglish", phone: "98140 23457",
    cg: { name: "Neha", rel: "Daughter", phone: "98722 11890" },
    conditions: ["Thyroid", "High BP"],
    allergies: "None known",
    history: "Thyroid since 2019, dose changed in July. Lower back pain on and off.",
    doctors: [
      { name: "Dr. Rekha Sood", sp: "Thyroid", date: isoPlus(base, 26), time: "5:00 pm", tests: "TSH" },
      { name: "Dr. Simran Kaur", sp: "Heart & BP", date: isoPlus(base, 22), time: "11:30 am", tests: "" },
    ],
    meds: [
      { name: "Thyronorm", dose: "50 mcg", times: ["Early morning"], note: "Thyroid · empty stomach", dr: "Dr. Rekha Sood" },
      { name: "Telmisartan", dose: "40 mg", times: ["Morning"], note: "BP · after breakfast", dr: "Dr. Simran Kaur" },
      { name: "Calcium + D3", dose: "1 tablet", times: ["Night"], note: "Bones · after dinner", dr: "Dr. Rekha Sood" },
    ],
    checkin: { call: "8:00 am", medMorning: "Call", medNight: "WhatsApp", weekly: "Sunday 11:00 am", alerts: ["missed", "range", "noanswer"] },
    planCh: {},
  };
}

interface History { readings: Record<string, ReadingLog[]>; labs: Record<string, Lab>; reports: Report[]; adherence: [number, number] }

const HISTORY: Record<string, History> = {
  Ramesh: {
    readings: {
      bp: [[-7, 138, 88], [-6, 134, 86], [-5, 142, 90], [-4, 136, 84], [-3, 130, 82], [-2, 133, 85], [-1, 131, 84]],
      fbs: [[-7, 142], [-6, 136], [-5, 151], [-4, 128], [-3, 124], [-2, 131], [-1, 122]],
      weight: [[-44, 73.4], [-14, 72.6]],
      pain: [[-10, 6], [-3, 5]],
    },
    labs: { hba1c: { name: "HbA1c", unit: "%", target: 7, pts: [["Jan", 8.2], ["Apr", 7.9], ["Jul", 7.8], ["Oct", 7.1]] } },
    reports: [{ name: "Blood test", lab: "City Path Lab", date: "2 days ago", rows: [["HbA1c", "7.8 %", "7.1 %", "good", "Better"], ["LDL cholesterol", "128", "104", "good", "Better"], ["Vitamin D", "18", "22", "warn", "Still low"], ["Creatinine", "1.0", "1.1", "same", "Same"]] }],
    adherence: [26, 28],
  },
  Kamla: {
    readings: { bp: [[-7, 130, 82], [-6, 128, 80], [-5, 126, 80], [-4, 131, 83], [-3, 127, 79], [-2, 129, 81], [-1, 126, 80]], weight: [[-44, 61.2], [-14, 61.0]] },
    labs: { tsh: { name: "TSH", unit: "mIU/L", target: 4.5, pts: [["Feb", 6.4], ["May", 5.8], ["Aug", 4.1], ["Oct", 3.2]] } },
    reports: [{ name: "Thyroid test", lab: "City Path Lab", date: "Last week", rows: [["TSH", "5.8", "3.2", "good", "Better"], ["Free T4", "0.9", "1.1", "good", "Normal"]] }],
    adherence: [27, 28],
  },
};

export function buildDoses(pr: Profile, keep: Dose[] = []): Dose[] {
  let i = 0;
  const out: Dose[] = [];
  pr.meds.forEach((m) =>
    SLOTS.filter((s) => m.times.includes(s)).forEach((t) => {
      const prev = keep.find((k) => k.name === m.name && k.slot === t);
      out.push({
        id: `d${i++}`, name: m.name, dose: m.dose, slot: t, note: m.note, dr: m.dr,
        ch: /Night|Afternoon/.test(t) ? pr.checkin.medNight : pr.checkin.medMorning,
        taken: prev?.taken ?? null,
      });
    }),
  );
  return out;
}

export function makePerson(pr: Profile): Person {
  const h: History = structuredClone(HISTORY[pr.first] || { readings: {}, labs: {}, reports: [], adherence: [0, 0] });
  return {
    id: Math.random().toString(36).slice(2, 9),
    pr, plan: buildPlan(pr), doses: buildDoses(pr),
    readings: h.readings, labs: h.labs, reports: h.reports, adherence: h.adherence,
    weekly: [], log: [], wa: [], chips: [], followup: null,
    met: false, startedDay: -1, morningDone: -1, waDay: -1, waExpect: null, transcripts: [],
  };
}
