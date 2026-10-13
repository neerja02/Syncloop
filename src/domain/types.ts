export type Slot = "Early morning" | "Morning" | "Afternoon" | "Night";
export type Channel = "Call" | "WhatsApp" | "Lab";
export type Judge = "good" | "warn" | "low" | "bad";
export type Tone = "good" | "warn" | "bad" | "same" | "acc";
export type AlertKey = "missed" | "range" | "noanswer";

export interface Doctor {
  name: string;
  sp: string;
  /** ISO date YYYY-MM-DD, or "" when not booked */
  date: string;
  time: string;
  tests: string;
}

export interface Medicine {
  name: string;
  dose: string;
  times: Slot[];
  note: string;
  dr: string;
}

export interface Profile {
  first: string;
  name: string;
  rel: string;
  age: string;
  gender: string;
  lang: string;
  phone: string;
  cg: { name: string; rel: string; phone: string };
  conditions: string[];
  allergies: string;
  history: string;
  doctors: Doctor[];
  meds: Medicine[];
  checkin: { call: string; medMorning: "Call" | "WhatsApp"; medNight: "Call" | "WhatsApp"; weekly: string; alerts: AlertKey[] };
  planCh: Record<string, Channel>;
}

export interface ReadingDef {
  id: string;
  name: string;
  unit: string;
  freq: string;
  when: string;
  ch: Channel;
  def?: string;
}

export interface Dose {
  id: string;
  name: string;
  dose: string;
  slot: Slot;
  note: string;
  dr: string;
  ch: "Call" | "WhatsApp";
  taken: string | null;
}

/** [dayOffset, value] or [dayOffset, systolic, diastolic] for BP */
export type ReadingLog = [number, number] | [number, number, number];

export interface Lab {
  name: string;
  unit: string;
  target: number;
  pts: [string, number][];
}

export interface Report {
  name: string;
  lab: string;
  date: string;
  rows: [string, string, string, Tone, string][];
}

export interface WeeklyResult {
  date: string;
  rows: [string, string, Tone, string][];
  verdict: string;
}

export interface Followup {
  key?: "stomach" | "knee" | "sleep";
  /** e.g. "ghutne mein dard" */
  text: string;
  advice?: string;
}

export interface Chip {
  label: string;
  action: string;
  arg?: string;
}

export type ChatItem =
  | { t: "day"; x: string }
  | { t: "nurse"; x: string }
  | { t: "me"; x: string }
  | { t: "note"; x: string; ic?: string }
  | { t: "alert"; x: string }
  | { t: "card"; kind: "meds"; slots: Slot[]; title: string }
  | { t: "card"; kind: "tips"; title: string; items: { text: string; sub?: string; done?: boolean }[] }
  | { t: "card"; kind: "reading"; rid: string; def: string; done?: string; judge?: Tone; after?: string }
  | { t: "card"; kind: "report"; ri: number }
  | { t: "card"; kind: "weekly"; w: WeeklyResult }
  | { t: "card"; kind: "rx"; dr: string; lines: [string, string, Tone, string][] };

export interface WaItem {
  id: string;
  day?: string;
  from?: "asha" | "me";
  html?: string;
  time?: string;
  actions?: string[];
  handler?: string;
  used?: boolean;
}

export interface Person {
  id: string;
  pr: Profile;
  plan: ReadingDef[];
  doses: Dose[];
  readings: Record<string, ReadingLog[]>;
  labs: Record<string, Lab>;
  reports: Report[];
  adherence: [number, number];
  weekly: WeeklyResult[];
  log: ChatItem[];
  wa: WaItem[];
  chips: Chip[];
  followup: Followup | null;
  met: boolean;
  startedDay: number;
  morningDone: number;
  waDay: number;
  waExpect: string | null;
  transcripts: { day: number; kind: string; lines: { who: "asha" | "me"; text: string }[] }[];
}
