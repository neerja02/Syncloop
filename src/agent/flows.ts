/**
 * Asha's scripted conversation engine for the in-app chat.
 * Everything stored in chat history is plain data (no functions), so the
 * conversation survives a page refresh. Chips and reading cards refer to
 * actions by name; ACTIONS below runs them.
 */
import { docFor, judge, PROBLEMS, READ, readingReply, SLOTS, valueText, type ProblemKey } from "../domain/catalog";
import { dayLabel } from "../domain/dates";
import { has, hon, nextVisit, visitText } from "../domain/health";
import { buildDoses } from "../domain/samples";
import type { ChatItem, Chip, Person } from "../domain/types";
import { getState } from "../store/useStore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let busy = false;
export const isBusy = () => busy;
async function locked(fn: () => Promise<void>) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } finally {
    busy = false;
    getState().setTyping(false);
  }
}

const P = () => getState().current()!;
const push = (item: ChatItem) => getState().push(item);
const chips = (c: Chip[]) => getState().setChips(c);
const me = (x: string) => push({ t: "me", x });

async function nurse(x: string, delay?: number) {
  const st = getState();
  st.setTyping(true);
  await sleep(delay ?? Math.min(1400, 450 + x.replace(/<[^>]+>/g, "").length * 11));
  st.setTyping(false);
  push({ t: "nurse", x });
}

export function nowStr() {
  const d = new Date();
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

/* ---------------- day start ---------------- */

export function startDayIfNeeded() {
  const s = getState(), p = s.current();
  if (!p || p.startedDay === s.day) return;
  s.mutate((x) => void (x.startedDay = s.day));
  void locked(async () => {
    push({ t: "day", x: `${dayLabel(s.baseDate, s.day)} · ${p.pr.checkin.call}` });
    if (!p.met) await firstMeeting();
    else await dailyGreeting();
  });
}

const feelChips = (): Chip[] => [
  { label: "Bilkul theek hoon", action: "feel:ok" },
  ...(Object.keys(PROBLEMS) as ProblemKey[]).map((k) => ({ label: PROBLEMS[k].chip, action: "problem", arg: k })),
];

async function firstMeeting() {
  const p = P(), pr = p.pr;
  getState().mutate((x) => void (x.met = true));
  await nurse(`Namaste ${esc(hon(p))} 🙏 Main Asha hoon, aapki nurse.`);
  const docs = pr.doctors.filter((d) => d.name).map((d) => esc(d.name)).join(", ");
  await nurse(`${esc(pr.cg.name || "Aapke ghar walon")} ne aapki saari details mujhe de di hain: ${esc(pr.conditions.join(", ").replace("High BP", "BP") || "aapki health")}${docs ? `, aur ${docs} ki dawaiyan` : ""}.`);
  const daily = p.plan.filter((r) => r.freq === "Daily").map((r) => r.name.toLowerCase());
  await nurse(`Roz subah <b>${esc(pr.checkin.call)}</b> baje main aapko call karungi, haal-chaal poochhungi${daily.length ? ` aur ${esc(daily.join(", "))} note karungi` : ""}. Raat ki dawai ka reminder WhatsApp pe aayega. Har ${esc(pr.checkin.weekly.split(" ")[0])} hum ek chhota sa health check karenge.`);
  await nurse("Aaj aap kaisa feel kar rahe hain?");
  chips(feelChips());
}

async function dailyGreeting() {
  const p = P();
  await nurse(`Good morning, ${esc(hon(p))} ☀️`);
  if (p.followup) {
    const f = p.followup;
    const said = f.key ? PROBLEMS[f.key].chat : `kal aapne bataya tha: ${f.text}`;
    await nurse(`${esc(said.charAt(0).toUpperCase() + said.slice(1))}. Aaj kaisa hai? Jo salah di thi, try ki?`);
    chips([{ label: "Pehle se behtar", action: "fu:better" }, { label: "Waisa hi hai", action: "fu:same" }, { label: "Aur badh gaya", action: "fu:worse" }]);
  } else {
    await nurse("Kal sab theek tha. Aaj kaisa feel ho raha hai?");
    chips(feelChips());
  }
}

async function problem(k: ProblemKey) {
  const pr = PROBLEMS[k];
  getState().mutate((x) => void (x.followup = { key: k, text: pr.text }));
  await nurse("Oh ho. Chaliye, aaj yeh try kijiye:");
  push({ t: "card", kind: "tips", title: "Asha ki salah", items: pr.tips.map((t) => ({ text: t[0], sub: t[1] || undefined })) });
  await nurse("Kal subah main poochhungi ki farak pada ya nahi. Agar dard bahut badh jaye toh mujhe turant bataiye.");
  await medsPrompt();
}

function morningSlots(p: Person) {
  return SLOTS.filter((s) => /morning/i.test(s) && p.doses.some((d) => d.slot === s));
}

async function medsPrompt() {
  const p = P(), slots = morningSlots(p);
  if (!slots.length) return afterMeds();
  if (p.doses.filter((d) => slots.includes(d.slot)).every((d) => d.taken)) {
    getState().mutate((x) => void (x.morningDone = getState().day));
    return afterMeds();
  }
  await nurse("Subah ki dawai ka time. Lene ke baad tick kar dijiye:");
  push({ t: "card", kind: "meds", slots, title: "Subah ki dawai" });
  chips([{ label: "Sab le li", action: "meds:all" }, { label: "Abhi nahi", action: "meds:later" }]);
}

async function afterMeds() {
  chips([]);
  getState().mutate((x) => void (x.morningDone = getState().day));
  await nurse("Subah ki dawai ho gayi ✓");
  const p = P(), day = getState().day;
  const r = has(p, "fbs") ? "fbs" : has(p, "bp") ? "bp" : null;
  if (r && !(p.readings[r] || []).some((x) => x[0] === day)) {
    await nurse(r === "fbs" ? "Aaj ka fasting sugar kitna aaya?" : "Aaj ka BP kitna aaya?");
    askReading(r, "wrapUp");
  } else await wrapUp();
}

async function wrapUp() {
  const s = getState(), p = P(), v = nextVisit(p, s.baseDate, s.day);
  if (v && v.days <= 10) await nurse(`Yaad hai na, <b>${esc(visitText(v.d))}</b> ko ${esc(v.d.name)} ke paas jaana hai. Ek din pehle main sab yaad dila dungi.`);
  await nurse("Bas aaj ke liye itna hi. Kuch bhi poochhna ho toh yahin bol dijiye, main yahin hoon.");
}

export function askReading(rid: string, after?: string) {
  const p = P();
  const def = p.plan.find((r) => r.id === rid)?.def || READ[rid].def;
  push({ t: "card", kind: "reading", rid, def, after });
}

/* ---------------- medicines ---------------- */

export function toggleDose(id: string, fromChat: boolean) {
  const s = getState(), p = s.current();
  const d = p?.doses.find((x) => x.id === id);
  if (!p || !d) return;
  if (d.taken) {
    s.showToast(`<b>${esc(d.name)}</b> already taken at ${esc(d.taken)}. Doosri goli mat lijiye.`, () =>
      getState().mutate((x) => void (x.doses.find((y) => y.id === id)!.taken = null)),
    );
    return;
  }
  s.mutate((x) => void (x.doses.find((y) => y.id === id)!.taken = nowStr()));
  if (fromChat) {
    const after = getState().current()!;
    const m = after.doses.filter((x) => /morning/i.test(x.slot));
    if (m.length && m.every((x) => x.taken) && after.morningDone !== s.day && !busy) void locked(afterMeds);
  }
}

/* ---------------- readings ---------------- */

export function logReading(personId: string, rid: string, value: string) {
  const res = judge(rid, value);
  if (!res) return null;
  const s = getState();
  s.mutate((p) => {
    p.readings[rid] = p.readings[rid] || [];
    const arr = p.readings[rid];
    const val = (rid === "bp" ? [s.day, res.s!, res.d!] : [s.day, res.n!]) as [number, number] | [number, number, number];
    const i = arr.findIndex((x) => x[0] === s.day);
    if (i >= 0) arr[i] = val;
    else arr.push(val);
  }, personId);
  return res;
}

export function familyNote(p: Person, text: string, urgent = true) {
  getState().push({ t: "note", ic: urgent ? "!" : "✓", x: `Asha messaged <b>${esc(p.pr.cg.name || "family")}</b>${p.pr.cg.phone ? ` (${esc(p.pr.cg.phone)})` : ""}: “${esc(text)}”` }, p.id);
}

export function submitReading(index: number, value: string) {
  void locked(async () => {
    const s = getState(), p = s.current()!;
    const card = p.log[index];
    if (!card || card.t !== "card" || card.kind !== "reading") return;
    const res = logReading(p.id, card.rid, value);
    if (!res) {
      s.showToast(`Please enter the number like ${card.rid === "bp" ? "130/85" : "120"}`);
      return;
    }
    const tone = res.j === "low" ? "bad" : res.j;
    s.mutate((x) => {
      const c = x.log[index];
      if (c.t === "card" && c.kind === "reading") {
        c.done = valueText(card.rid, res);
        c.judge = tone;
      }
    });
    const rep = readingReply(P(), card.rid, res);
    if (res.j === "bad") push({ t: "alert", x: `<strong>Reading out of safe range</strong>${rep.chat}` });
    else await nurse(rep.chat);
    if (rep.alert) familyNote(P(), `${READ[card.rid].name} ${valueText(card.rid, res)} today. Please check on ${P().pr.rel || P().pr.first}.`);
    if (card.after && ACTIONS[card.after]) await ACTIONS[card.after]();
  });
}

/* ---------------- chip actions ---------------- */

const ACTIONS: Record<string, (arg?: string) => Promise<void>> = {
  "feel:ok": async () => {
    await nurse("Bahut achha 😊");
    await medsPrompt();
  },
  problem: async (k) => problem(k as ProblemKey),
  "fu:better": async () => {
    getState().mutate((x) => void (x.followup = null));
    await nurse("Bahut achha! 😊 Wahi salah 1–2 din aur continue kijiye.");
    await medsPrompt();
  },
  "fu:same": async () => {
    const p = P(), f = p.followup;
    const doc = docFor(p, f?.key ? PROBLEMS[f.key].doc : /Gen/i);
    await nurse(`Hmm. Do din ho gaye, ab ${esc(doc)} ko dikhana theek rahega. ${esc(p.pr.cg.name)} ko bolun appointment ke liye?`);
    chips([{ label: "Haan, bol do", action: "fu:book" }, { label: "Abhi nahi", action: "fu:skip" }]);
  },
  "fu:book": async () => {
    const p = P(), f = p.followup;
    familyNote(p, `${p.pr.first} ji ka ${f?.text.replace(/ tha$| thi$/, "")} 2 din se theek nahi. Please doctor ka appointment le lijiye.`, false);
    await nurse("Bata diya. Tab tak salah continue rakhiye.");
    await medsPrompt();
  },
  "fu:skip": async () => {
    await nurse("Theek hai. Kal phir poochhungi.");
    await medsPrompt();
  },
  "fu:worse": async () => {
    const p = P();
    familyNote(p, `${p.pr.first} ji ki takleef badh gayi hai, aaj doctor ko dikhana chahiye.`);
    await nurse(`${esc(p.pr.cg.name)} ko bata diya hai, aaj doctor ko dikha lijiye. Agar bahut tez dard ho toh 112 pe call kijiye.`);
    await medsPrompt();
  },
  "meds:all": async () => {
    const p = P(), slots = morningSlots(p), t = nowStr();
    getState().mutate((x) => x.doses.forEach((d) => { if (slots.includes(d.slot) && !d.taken) d.taken = t; }));
    await afterMeds();
  },
  "meds:later": async () => {
    await nurse("Koi baat nahi. Naashte ke baad le lijiye, main 9:15 pe yaad dila dungi.");
  },
  "ask:family": async (text) => {
    familyNote(P(), `Dawai ke baare mein sawaal: ${text}`, false);
    await nurse("Bata diya. Woh doctor se pooch ke batayengi.");
  },
  "sym:today": async () => {
    await nurse("Thoda aaraam kijiye, do glass paani pijiye. Main dopahar 1 baje phir poochhungi. Agar bukhaar 101°F se zyada ho ya chakkar aaye toh mujhe bataiye.");
    push({ t: "note", ic: "↻", x: "Asha will check on this at <b>1:00 pm</b>." });
  },
  "sym:days": async () => {
    await nurse(`2–3 din kaafi hai, doctor ko dikhana chahiye. ${esc(P().pr.cg.name)} ko bolun?`);
    chips([{ label: "Haan", action: "sym:book" }]);
  },
  "sym:book": async () => {
    familyNote(P(), `${P().pr.first} ji ko 2–3 din se takleef hai. Please doctor ka appointment le lijiye.`, false);
    await nurse("Bata diya.");
  },
  wrapUp: async () => wrapUp(),
};

export function runChip(i: number) {
  const p = getState().current();
  const c = p?.chips[i];
  if (!c || busy) return;
  chips([]);
  me(c.label);
  void locked(() => ACTIONS[c.action](c.arg));
}

/* ---------------- free text and voice ---------------- */

export function sendText(text: string) {
  if (busy || !text.trim()) return;
  chips([]);
  me(text);
  void locked(() => handle(text));
}

async function handle(text: string) {
  const s = text.toLowerCase(), p = P();
  if (/chest|seene|saans|breath|gir gay|fell|faint|behosh|unconscious|stroke|lakwa/.test(s)) {
    push({ t: "alert", x: `<strong>Abhi madad lijiye.</strong>Turant <b style="font-size:24px">112</b> pe call kijiye ya paas wale ko bulaiye. Akele mat rahiye.` });
    push({ t: "note", ic: "!", x: `Asha called <b>${esc(p.pr.cg.name)}</b> (${esc(p.pr.cg.phone)}) and shared the location.` });
    await nurse(`${esc(p.pr.cg.name)} ko call kar diya hai. Main yahin hoon.`);
    return;
  }
  const bp = s.match(/(\d{2,3})\s*(?:\/|by|bata)\s*(\d{2,3})/);
  if (bp && /bp|pressure|\//.test(s)) {
    const v = `${bp[1]}/${bp[2]}`;
    const res = logReading(p.id, "bp", v)!;
    const rep = readingReply(P(), "bp", res);
    if (res.j === "bad") push({ t: "alert", x: `<strong>Reading out of safe range</strong>${rep.chat}` });
    else await nurse(rep.chat);
    if (rep.alert) familyNote(P(), `BP ${v} today.`);
    return;
  }
  const sg = s.match(/sugar\D{0,10}(\d{2,3})|(\d{2,3})\D{0,6}sugar/);
  if (sg) {
    const n = sg[1] || sg[2];
    const res = logReading(p.id, "fbs", n)!;
    const rep = readingReply(P(), "fbs", res);
    await nurse(rep.chat);
    if (rep.alert) familyNote(P(), `Sugar ${n} today.`);
    return;
  }
  if (/again|dobara|ek aur|doosri|second|extra|double/.test(s) && /goli|dawai|tablet|medicine|dose|bp|thyroid|sugar/.test(s)) {
    const d = p.doses.find((x) => s.includes(x.name.toLowerCase())) || (/bp/.test(s) ? p.doses.find((x) => /BP/.test(x.note)) : undefined) || p.doses.find((x) => x.taken);
    if (d?.taken) await nurse(`Nahi ${esc(hon(p))}, doosri mat lijiye. <b>${esc(d.name)} ${esc(d.dose)}</b> aapne aaj ${esc(d.taken)} pe le li hai. ${esc(d.dr)} ne din mein ek baar likhi hai.`);
    else if (d) await nurse(`${esc(d.name)} aaj abhi tak nahi li hai, toh ek goli abhi le sakte hain.`);
    else await nurse("Aaj aapne koi dawai do baar nahi li hai. Kaunsi goli ki baat kar rahe hain?");
    return;
  }
  if (/kya.*le sakt|can i take|should i take|paracetamol|crocin|combiflam|painkiller|dose badha|band kar/.test(s)) {
    await nurse(`Yeh doctor sahab hi bata sakte hain, ${esc(hon(p))}. Main koi nayi dawai nahi bata sakti. ${esc(p.pr.cg.name)} se bolun ki ${esc(p.pr.doctors[0]?.name || "doctor")} se pooch lein?`);
    chips([{ label: "Haan, bol do", action: "ask:family", arg: text }]);
    return;
  }
  if (/le li|li kya|did i take|taken|kaunsi dawai|dawai.*aaj|missed/.test(s)) {
    const done = p.doses.filter((d) => d.taken), left = p.doses.filter((d) => !d.taken);
    await nurse(`${done.length ? `Aaj li hui: ${done.map((d) => `<b>${esc(d.name)}</b> (${esc(d.taken)})`).join(", ")}.` : "Aaj abhi tak koi dawai tick nahi hui."} ${left.length ? `Baaki: ${left.map((d) => `${esc(d.name)} (${d.slot.toLowerCase()})`).join(", ")}.` : "Aaj ki sab dawai ho gayi ✓"}`);
    return;
  }
  if (/knee|ghutn|joint/.test(s)) return problem("knee");
  if (/stomach|pet |pet$|acidity|gas/.test(s)) return problem("stomach");
  if (/neend|sleep|so nahi/.test(s)) return problem("sleep");
  if (/report|test|result|hba1c|tsh|cholesterol/.test(s)) {
    if (p.reports[0]) {
      await nurse("Aapki latest report:");
      push({ t: "card", kind: "report", ri: 0 });
      await nurse("Agli doctor visit pe yeh saath le jaana hai, main yaad dila dungi.");
    } else await nurse("Abhi koi report nahi hai. Camera button se report ki photo bhej dijiye, main padh ke bata dungi.");
    return;
  }
  if (/doctor|visit|appointment|checkup|check-up/.test(s)) {
    const st = getState(), v = nextVisit(p, st.baseDate, st.day);
    await nurse(v ? `Agla appointment: <b>${esc(v.d.name)}</b>, ${esc(visitText(v.d))}. ${v.d.tests ? `Usse pehle ${esc(v.d.tests)} test karwana hai.` : ""}` : "Abhi koi appointment fix nahi hai.");
    return;
  }
  if (/dard|pain|bukhar|fever|khansi|cough|chakkar|dizzy|kamzori|weak|headache|sir/.test(s)) {
    await nurse(`Oh, ${esc(hon(p))}. Kab se hai?`);
    chips([{ label: "Aaj subah se", action: "sym:today" }, { label: "2–3 din se", action: "sym:days" }]);
    return;
  }
  if (/thank|shukriya|dhanyavad|^ok|theek|accha|achha/.test(s)) {
    await nurse(`Hamesha, ${esc(hon(p))} 😊`);
    return;
  }
  await nurse(`Note kar liya, ${esc(hon(p))}. Thoda aur bataiye: kab se hai, aur kal se behtar hai ya kharab?`);
}

/* ---------------- prescription photo (simulated reading) ---------------- */

export function sharePrescription() {
  void locked(async () => {
    chips([]);
    me("📷 Prescription ki photo");
    await nurse("Padh rahi hoon…", 900);
    const p = P();
    const docName = p.pr.doctors.find((d) => /Heart|BP/i.test(d.sp))?.name || p.pr.doctors[0]?.name || "Doctor";
    if (!p.pr.meds.some((m) => m.name === "Ecosprin")) {
      getState().mutate((x) => {
        x.pr.meds.push({ name: "Ecosprin", dose: "75 mg", times: ["Afternoon"], note: "Heart · after lunch", dr: docName });
        x.doses = buildDoses(x.pr, x.doses);
      });
    }
    const same = P().pr.meds.filter((m) => m.dr === docName && m.name !== "Ecosprin");
    push({ t: "card", kind: "rx", dr: `${docName} · today`, lines: [...same.map((m) => [`${m.name} ${m.dose}`, m.times.join(", ").toLowerCase(), "same", "No change"] as [string, string, "same", string]), ["Ecosprin 75 mg", "after lunch", "warn", "New"]] });
    await nurse(`Yeh <b>${esc(docName)}</b> ki aaj ki parchi hai. Purani dawaiyan same hain, ek nayi add hui hai: <b>Ecosprin 75 mg</b>, lunch ke baad.`);
    await nurse("Maine isse aapki daily list mein daal diya hai aur roz 1:30 baje WhatsApp pe yaad dila dungi. Yeh khaali pet mat lijiyega.");
  });
}

/* ---------------- test rail: high reading ---------------- */

export function testHighReading() {
  void locked(async () => {
    chips([]);
    const p = P(), rid = has(p, "bp") ? "bp" : "fbs";
    await nurse(rid === "bp" ? "Shaam ka BP bata dijiye:" : "Abhi ka sugar bata dijiye:");
    push({ t: "card", kind: "reading", rid, def: rid === "bp" ? "174/106" : "262" });
  });
}

export const VOICE_SAMPLES = ["Mera BP 128/82 aaya", "Ghutne mein phir dard hai", "Kya maine BP ki goli le li?", "Kya main ek aur BP ki goli le sakta hoon?"];
