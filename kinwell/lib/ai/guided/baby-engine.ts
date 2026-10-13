/**
 * Baby safety mode (under 12 months; extra-conservative under 3 months).
 *
 * Babies get their own questions and much lower thresholds than adults: a newborn's symptoms are never
 * casually reassured. Based on AAP (HealthyChildren.org) guidance, e.g. a temperature of 38°C / 100.4°F or
 * higher in a baby under 3 months needs prompt medical assessment. Demo content — requires paediatric review.
 */
import type { GuidedState, QuestionDef, StructuredAnswer } from "./types";
import type { Decision } from "./symptom-engine";

const opt = (label: string, value: string, extra: Partial<{ reply: string; exclusive: boolean }> = {}) => ({ label, value, ...extra });
const NONE = { label: "None of these", value: "none", exclusive: true };
const has = (s: GuidedState, key: string, v: string) => (s.answers[key] ?? "").split("|").includes(v);

export const BABY_AGE_OPTIONS = [opt("Under 1 month", "0.5"), opt("1–3 months", "2"), opt("3–6 months", "4.5"), opt("6–12 months", "9")];

export function babyAgeQuestion(): QuestionDef {
  return { key: "baby_age", text: "How old is your baby?", style: "chips", options: BABY_AGE_OPTIONS };
}

export function babyCategoryQuestion(name: string): QuestionDef {
  return {
    key: "baby_category",
    text: `What's worrying you about ${name}?`,
    style: "symptoms",
    options: [opt("Fever", "fever"), opt("Not feeding well", "feeding"), opt("Breathing problem", "breathing"), opt("Vomiting", "vomiting"), opt("Loose motions", "diarrhoea"), opt("Rash", "rash"), opt("Very sleepy", "sleepy"), opt("Crying a lot", "crying"), opt("Something else", "other")],
    allowText: true,
    textPlaceholder: "Describe it in a few words",
  };
}

export function applyBabyAnswer(prev: GuidedState, a: StructuredAnswer): GuidedState {
  const s: GuidedState = { ...prev, answers: { ...prev.answers, [a.key]: a.value }, asked: prev.asked.includes(a.key) ? prev.asked : [...prev.asked, a.key], pending: null };
  if (a.key === "baby_age") s.patient = { ...(s.patient ?? { kind: "baby", label: "your baby" }), ageMonths: Number(a.value) };
  if (a.key === "baby_category") s.symptomType = a.value;
  if (a.key === "baby_duration") s.onset = a.value;
  return s;
}

function months(s: GuidedState) {
  return s.patient?.ageMonths ?? 6;
}

/** Hard stops: emergency for danger signs at any infant age, urgent ("now") for newborn fever and dehydration. */
export function babyScreen(s: GuidedState): { level: "emergency" | "urgent"; reasons: string[] } | null {
  const e: string[] = [];
  const u: string[] = [];
  for (const [v, label] of [
    ["hard_to_wake", "Hard to wake, or weak and floppy"],
    ["breathing", "Struggling to breathe or ribs pulling in"],
    ["blue", "Blue, grey or very pale lips or skin"],
    ["seizure", "A fit or seizure"],
    ["green_vomit", "Green or bloody vomit"],
  ] as const)
    if (has(s, "baby_danger", v)) e.push(label);
  const t = s.answers.baby_temp;
  const m = months(s);
  if (m < 3 && (t === "38_39" || t === "39_plus")) u.push("A temperature of 38°C (100.4°F) or higher in a baby under 3 months");
  if (m >= 3 && m < 6 && t === "39_plus") u.push("A temperature of 39°C (102.2°F) or higher in a baby under 6 months");
  if (s.answers.feed_amount === "under_half" || s.answers.feed_amount === "refusing") u.push("Taking much less milk than usual");
  if (s.answers.wet_diapers === "under_3" || s.answers.wet_diapers === "none_8h") u.push("Fewer wet diapers — possible dehydration");
  if (s.answers.vomit_pattern === "every_feed" || (m < 3 && s.answers.vomit_pattern === "repeated")) u.push("Repeated vomiting");
  if (has(s, "baby_stool", "blood")) u.push("Blood in the stool");
  if (s.answers.baby_breathing === "fast" || s.answers.baby_breathing === "noisy") u.push(s.answers.baby_breathing === "fast" ? "Breathing faster than usual" : "Noisy or wheezy breathing");
  if (s.answers.rash_fade === "no") e.push("A rash that doesn't fade when pressed");
  if (s.symptomType === "sleepy" && m < 3) u.push("A young baby who is much sleepier than usual");
  if (e.length) return { level: "emergency", reasons: e };
  if (u.length) return { level: "urgent", reasons: u };
  return null;
}

export function babyNextQuestion(s: GuidedState, name: string): QuestionDef | null {
  const asked = (k: string) => s.answers[k] != null;
  if (s.patient?.ageMonths == null) return babyAgeQuestion();
  if (!s.symptomType) return babyCategoryQuestion(name);
  // Danger signs first, for every complaint.
  if (!asked("baby_danger"))
    return {
      key: "baby_danger",
      text: `Because babies can get unwell quickly, I need to check a few things first. Is ${name} showing any of these right now?`,
      style: "multi",
      options: [opt("Hard to wake, or weak and floppy", "hard_to_wake"), opt("Struggling to breathe or ribs pulling in", "breathing"), opt("Blue, grey or very pale lips or skin", "blue"), opt("A fit or seizure", "seizure"), opt("Green or bloody vomit", "green_vomit"), NONE],
    };
  const type = s.symptomType;
  if ((type === "fever" || type === "sleepy" || type === "crying" || type === "feeding") && !asked("baby_temp"))
    return { key: "baby_temp", text: "What's the baby's temperature?", style: "chips", options: [opt("Below 38°C (100.4°F)", "under_38"), opt("38–39°C (100.4–102.2°F)", "38_39"), opt("39°C (102.2°F) or higher", "39_plus"), opt("Haven't measured", "unknown")] };
  if (["feeding", "fever", "vomiting", "diarrhoea", "sleepy", "crying"].includes(type) && !asked("feed_amount"))
    return { key: "feed_amount", text: "How much is the baby feeding compared with usual?", style: "chips", options: [opt("About normal", "normal"), opt("A bit less", "bit_less"), opt("Less than half", "under_half"), opt("Refusing all feeds", "refusing")] };
  if (["feeding", "fever", "vomiting", "diarrhoea"].includes(type) && !asked("wet_diapers"))
    return { key: "wet_diapers", text: "How many wet diapers in the last 24 hours?", style: "chips", options: [opt("6 or more", "6_plus"), opt("3–5", "3_5"), opt("Fewer than 3", "under_3"), opt("None in 8 hours or more", "none_8h")] };
  if (type === "vomiting" && !asked("vomit_pattern"))
    return { key: "vomit_pattern", text: "How often is the baby vomiting?", style: "chips", options: [opt("Once or twice", "once"), opt("Several times", "repeated"), opt("After every feed", "every_feed")] };
  if (type === "diarrhoea" && !asked("baby_stool"))
    return { key: "baby_stool", text: "Anything else about the stools?", style: "multi", options: [opt("Blood in the stool", "blood"), opt("Very watery and frequent", "watery"), NONE] };
  if (type === "breathing" && !asked("baby_breathing"))
    return { key: "baby_breathing", text: "How is the breathing?", style: "chips", options: [opt("Blocked nose only", "nose"), opt("Faster than usual", "fast"), opt("Noisy or wheezy", "noisy"), opt("Coughing", "cough")] };
  if (type === "rash" && !asked("rash_fade"))
    return { key: "rash_fade", text: "Press a clear glass against the rash. Does it fade?", style: "yesno", options: [opt("Yes, it fades", "yes"), opt("No, it doesn't fade", "no"), opt("Not sure", "unsure")] };
  if (!s.onset) return { key: "baby_duration", text: "When did this start?", style: "duration", options: [opt("Today", "today"), opt("1–2 days ago", "1_2_days"), opt("3 days or more", "3_plus")] };
  return null;
}

export function babyDecide(s: GuidedState, name: string): Decision {
  const flag = babyScreen(s);
  if (flag) return { kind: "escalate", ...flag };
  const q = babyNextQuestion(s, name);
  if (q) return { kind: "ask", question: q };
  const m = months(s);
  const type = s.symptomType ?? "other";
  const lasting = s.onset === "3_plus" || (s.onset === "1_2_days" && type === "fever");
  const needsDoctor = m < 3 || lasting || s.answers.feed_amount === "bit_less" || s.answers.baby_temp === "38_39" || s.answers.baby_temp === "unknown" || ["breathing", "rash", "other"].includes(type);
  const reason = m < 3 ? "babies under 3 months should be checked by a doctor for any new symptom" : lasting ? "it has lasted more than a day or two" : s.answers.feed_amount === "bit_less" ? "the baby is feeding less than usual" : s.answers.baby_temp === "unknown" ? "the temperature hasn't been measured yet" : "a paediatrician can examine the baby directly";
  return {
    kind: "complete",
    outcome: {
      level: needsDoctor ? "routine" : "self_care",
      speciality: needsDoctor ? "Paediatrician" : null,
      timing: m < 3 ? "soon" : "routine",
      headline: needsDoctor
        ? `Based on what you've told me, I didn't find the urgent warning signs I checked for, but because ${reason}, please speak with a Paediatrician${m < 3 ? " today or tomorrow" : " in the next day or two"}.`
        : `Based on what you've told me, I didn't find the urgent warning signs I checked for. You can keep a close eye on ${name} at home for now — and contact a Paediatrician if anything changes.`,
      reason: "A Paediatrician is the right doctor for babies and young children.",
      summary: [],
      selfCare: [
        "Keep feeding little and often — breast milk or formula as usual",
        "Dress the baby in light layers; don't over-wrap",
        s.answers.baby_temp === "unknown" ? "Measure the temperature with a thermometer if you can" : "Recheck the temperature every few hours",
        "Don't give any medicine without checking the dose with your paediatrician",
      ],
      watchFor: ["Hard to wake, floppy or unusually quiet", "Breathing fast, struggling, or ribs pulling in", "Fewer wet diapers or refusing feeds", "Blue or grey lips, green vomit, or a rash that doesn't fade", m < 3 ? "Any temperature of 38°C (100.4°F) or higher" : "A fever that keeps rising or lasts more than 2 days"],
    },
  };
}
