/**
 * Offline fallback for the check-in call: a scripted Hinglish conversation spoken
 * with the browser's built-in Hindi voice. It runs the same tool handlers as the
 * live ElevenLabs call, so the app updates the same way.
 */
import { PROBLEMS } from "../domain/catalog";
import { has, nextVisit, visitText } from "../domain/health";
import type { Person } from "../domain/types";
import { getState } from "../store/useStore";
import type { makeCallTools } from "./callTools";

type Tools = ReturnType<typeof makeCallTools>;
export interface SimStep {
  show: string;
  say: string;
  opts?: [string, () => void][];
  input?: "bp" | "weight" | "pain";
  end?: boolean;
}

export function dailyScript(p: Person, tools: Tools): SimStep[] {
  const f = p.pr.first, steps: SimStep[] = [];
  steps.push({ show: `Namaste ${f} ji, main Asha bol rahi hoon. Good morning! Kal raat neend kaisi aayi?`, say: `नमस्ते ${f} जी, मैं आशा बोल रही हूँ। गुड मॉर्निंग! कल रात नींद कैसी आई?`, opts: [["Achhi aayi", () => {}], ["Theek-thaak", () => {}]] });
  if (p.followup) {
    const fu = p.followup;
    const show = fu.key ? PROBLEMS[fu.key].text : fu.text;
    const say = fu.key ? PROBLEMS[fu.key].say : fu.text;
    steps.push({ show: `Aur kal aapko ${show}. Aaj kaisa hai?`, say: `और कल आपको ${say}। आज कैसा है?`, opts: [["Pehle se behtar hai", () => getState().mutate((x) => void (x.followup = null), p.id)], ["Waisa hi hai", () => {}]] });
  }
  const morning = p.doses.filter((d) => /morning/i.test(d.slot) && d.ch === "Call" && !d.taken);
  if (morning.length) {
    const names = morning.map((d) => d.name).join(" aur ");
    steps.push({ show: `Subah ki dawai ka time ho gaya: ${names}. Le li aapne?`, say: `सुबह की दवाई का टाइम हो गया: ${names}। ले ली आपने?`, opts: [["Haan, le li", () => morning.forEach((d) => tools.mark_medicine_taken({ medicine_name: d.name }))], ["Abhi nahi", () => {}]] });
  }
  const day = getState().day;
  if (has(p, "bp") && !(p.readings.bp || []).some((x) => x[0] === day))
    steps.push({ show: "Ab BP machine laga ke reading bata dijiye. Main likh leti hoon.", say: "अब BP मशीन लगा के रीडिंग बता दीजिए। मैं लिख लेती हूँ।", input: "bp" });
  const s = getState(), v = nextVisit(p, s.baseDate, s.day);
  if (v && v.days <= 10)
    steps.push({ show: `Aur yaad hai na, ${visitText(v.d)} ko ${v.d.name} ke paas jaana hai. Ek din pehle main yaad dila dungi.`, say: `और याद है ना, ${visitText(v.d)} को ${v.d.name} के पास जाना है। एक दिन पहले मैं याद दिला दूँगी।`, opts: [["Haan, yaad hai", () => {}]] });
  steps.push({ show: `Theek hai ${f} ji, apna khayal rakhiyega. Raat ko WhatsApp pe dawai ka reminder bhejungi. Namaste!`, say: `ठीक है ${f} जी, अपना ख़याल रखियेगा। रात को व्हाट्सऐप पे दवाई का रिमाइंडर भेजूँगी। नमस्ते!`, opts: [["Namaste, Asha", () => {}]], end: true });
  return steps;
}

export function weeklyScript(p: Person, tools: Tools): SimStep[] {
  const f = p.pr.first;
  const a: Record<string, string> = {};
  const steps: SimStep[] = [
    { show: `Namaste ${f} ji! Aaj hamara chhota sa weekly health check hai. Paanch minute lagenge. Is hafte neend kaisi rahi?`, say: `नमस्ते ${f} जी! आज हमारा छोटा सा वीकली हेल्थ चेक है। पाँच मिनट लगेंगे। इस हफ़्ते नींद कैसी रही?`, opts: [["Achhi rahi", () => (a.sleep = "good")], ["Theek-thaak", () => (a.sleep = "okay")], ["Kharab rahi", () => (a.sleep = "poor")]] },
    { show: "Koi dard ya takleef rahi is hafte?", say: "कोई दर्द या तकलीफ़ रही इस हफ़्ते?", opts: [["Nahi, sab theek", () => (a.pain = "none")], ["Thodi si", () => (a.pain = "some")], ["Haan, kaafi", () => (a.pain = "a_lot")]] },
  ];
  if (has(p, "pain")) steps.push({ show: "Ghutne ka dard, zero se das mein kitna denge?", say: "घुटने का दर्द, ज़ीरो से दस में कितना देंगे?", input: "pain" });
  steps.push({ show: "Bhookh kaisi lag rahi hai? Khaana theek se kha rahe hain?", say: "भूख कैसी लग रही है? खाना ठीक से खा रहे हैं?", opts: [["Haan, theek hai", () => (a.appetite = "normal")], ["Kam lagti hai", () => (a.appetite = "low")]] });
  steps.push({ show: "Aur mann kaisa raha? Khush, ya thoda udaas?", say: "और मन कैसा रहा? ख़ुश, या थोड़ा उदास?", opts: [["Khush", () => (a.mood = "happy")], ["Theek", () => (a.mood = "okay")], ["Thoda udaas", () => (a.mood = "low")]] });
  if (has(p, "feet")) steps.push({ show: "Pairon mein koi kat, chhaala ya sujan to nahi?", say: "पैरों में कोई कट, छाला या सूजन तो नहीं?", opts: [["Nahi, sab theek", () => (a.feet = "fine")], ["Thodi sujan hai", () => (a.feet = "problem")]] });
  steps.push({ show: "Last sawaal. Weighing machine pe khade hoke wazan bata dijiye.", say: "लास्ट सवाल। वेइंग मशीन पे खड़े होके वज़न बता दीजिए।", input: "weight" });
  steps.push({
    show: `Shukriya ${f} ji. Is hafte ki report main ${p.pr.cg.name} ko bhej rahi hoon. Apna khayal rakhiye!`,
    say: `शुक्रिया ${f} जी। इस हफ़्ते की रिपोर्ट मैं ${p.pr.cg.name} को भेज रही हूँ। अपना ख़याल रखिए!`,
    opts: [["Shukriya, Asha", () => tools.save_weekly_check(a as never)]],
    end: true,
  });
  return steps;
}

/* ---------- browser voice (fallback only) ---------- */

const FEMALE = /swara|kalpana|lekha|heera|neerja|veena|ananya|aditi|raveena|priya|google हिन्दी|google hindi|female|zira|samantha/i;

export function indianVoices(): SpeechSynthesisVoice[] {
  try {
    return (window.speechSynthesis?.getVoices() || []).filter((v) => /^hi|en[-_]IN/i.test(v.lang));
  } catch {
    return [];
  }
}

export function bestVoice(pick?: string): SpeechSynthesisVoice | null {
  const vs = indianVoices();
  if (pick) {
    const v = vs.find((x) => x.name === pick);
    if (v) return v;
  }
  return (
    vs.find((v) => /^hi/i.test(v.lang) && /swara|natural|online/i.test(v.name)) ||
    vs.find((v) => /^hi/i.test(v.lang) && FEMALE.test(v.name)) ||
    vs.find((v) => /^hi/i.test(v.lang)) ||
    vs.find((v) => FEMALE.test(v.name)) ||
    vs[0] ||
    null
  );
}

export function speak(say: string, show: string, pick?: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const v = bestVoice(pick);
    const hindi = !!v && /^hi/i.test(v.lang);
    const u = new SpeechSynthesisUtterance(hindi ? say : show);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "hi-IN";
    u.rate = 0.9;
    u.pitch = 1.08;
    s.speak(u);
  } catch { /* captions still show */ }
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
