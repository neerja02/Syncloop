import "server-only";
import { selectMeasurementRule, type ClinicalRule } from "@/lib/clinical/rules";
import { loadClinicalRules } from "@/lib/clinical/rules-repo";
import { evaluateTriage } from "@/lib/clinical/triage";
import { decideConfidence } from "@/lib/config/confidence";
import { PatientContextService } from "../services/patient-context";
import { excerpt, retrieveDoctorKnowledge } from "../services/retrieval";
import { baseResponse, cardId, subject, type AgentContext, type AgentResult } from "./context";
import { emergencyResult } from "./safety";
import type { CardAction, ChatCard, MeasurementResultCard } from "../types";
import type { ConversationState } from "@/lib/services/conversations";

type Pending = NonNullable<ConversationState["pending"]>;

const CONTEXT_LABEL: Record<string, string> = { fasting: "Fasting", before_meal: "Before a meal", after_meal: "After a meal", random: "Random", bedtime: "Bedtime" };
const CONTEXT_NOUN: Record<string, string> = { fasting: "fasting", before_meal: "before-meal", after_meal: "after-meal", random: "random", bedtime: "bedtime" };
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, half: 0.5, "an": 1, a: 1 };

export function parseGlucoseContext(t: string): string | null {
  const s = t.toLowerCase();
  if (/\b(fasting|empty stomach|before breakfast|on waking|first thing)\b/.test(s)) return "fasting";
  if (/\b(after|post)[- ]?(a |my |the )?(lunch|dinner|breakfast|meal|food|eating|meals)\b|\bpp\b|\bpost ?prandial\b|\bafter (i )?ate\b/.test(s)) return "after_meal";
  if (/\bbefore (a |my |the )?(lunch|dinner|meal|food|eating)\b/.test(s)) return "before_meal";
  if (/\b(bedtime|before bed|at night before sleep)\b/.test(s)) return "bedtime";
  if (/\brandom\b|\bnot sure when\b|\bdon'?t know\b/.test(s)) return "random";
  return null;
}

export function parseMinutesAfterMeal(t: string): number | null {
  const s = t.toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?|one|two|three|four|half an?|an?)\s*(hours?|hrs?|h\b|minutes?|mins?)/);
  if (!m) {
    if (/within (an|1) hour|immediately|right after/.test(s)) return 45;
    return null;
  }
  const raw = m[1]!.trim();
  const n = /^\d/.test(raw) ? Number(raw) : raw.startsWith("half") ? 0.5 : WORD_NUM[raw] ?? 1;
  return /^h/.test(m[2]!) ? Math.round(n * 60) : Math.round(n);
}

export function parseGlucoseValue(t: string): { value: number; unit: "mg/dL" | "mmol/L"; confidence: number } | null {
  const s = t.toLowerCase().replace(/\d{1,2}[:.]\d{2}\s*(am|pm)/g, " ");
  const mmol = s.match(/(\d{1,2}(?:\.\d)?)\s*mmol/);
  if (mmol) return { value: Math.round(Number(mmol[1]) * 18.0182), unit: "mmol/L", confidence: 0.98 };
  const nums = [...s.matchAll(/(?<![\d/.])(\d{2,3})(?![\d/])/g)].map((m) => Number(m[1])).filter((n) => n >= 20 && n <= 900);
  const hoursNums = new Set([...s.matchAll(/(\d+)\s*(hours?|hrs?|minutes?|mins?)/g)].map((m) => Number(m[1])));
  const candidates = nums.filter((n) => !hoursNums.has(n));
  if (!candidates.length) return null;
  return { value: candidates[0]!, unit: "mg/dL", confidence: candidates.length === 1 ? 0.99 : 0.7 };
}

export function parseBloodPressure(t: string): { systolic: number; diastolic: number } | null {
  const m = t.match(/\b(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})\b/i);
  if (!m) return null;
  const sys = Number(m[1]);
  const dia = Number(m[2]);
  if (sys < 50 || sys > 300 || dia < 25 || dia > 200 || dia >= sys) return null;
  return { systolic: sys, diastolic: dia };
}

function quick(options: string[]): ChatCard {
  return { id: cardId(), type: "quick_replies", options: options.map((o) => ({ label: o, value: o })) };
}

export async function measurementAgent(ctx: AgentContext): Promise<AgentResult> {
  const t = ctx.message.toLowerCase();
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);

  // Trend requests ("show my BP trend")
  if (/\b(trend|chart|graph|history)\b/.test(t) && !ctx.state.pending) return trendResult(ctx, patient, /\b(bp|blood pressure|pressure)\b/.test(t) ? "blood_pressure" : "blood_glucose");

  const bp = parseBloodPressure(ctx.message);
  const isBp = bp || ctx.state.pending?.kind === "blood_pressure" || (/\b(bp|blood pressure)\b/.test(t) && !/\bsugar|glucose\b/.test(t));
  if (isBp) return bloodPressureFlow(ctx, patient, bp);
  return glucoseFlow(ctx, patient);
}

async function glucoseFlow(ctx: AgentContext, patient: PatientContextService): Promise<AgentResult> {
  const pending: Pending = ctx.state.pending?.kind === "glucose" ? { ...ctx.state.pending } : { kind: "glucose" };
  const parsed = parseGlucoseValue(ctx.message);
  if (parsed) {
    if (decideConfidence("measurement", parsed.confidence) !== "accept" && pending.value == null) {
      return ask(ctx, { ...pending }, "I saw more than one number there. Which one was the blood sugar reading?", []);
    }
    pending.value = parsed.value;
  }
  pending.context = parseGlucoseContext(ctx.message) ?? pending.context ?? null;
  const minutes = parseMinutesAfterMeal(ctx.message);
  if (minutes != null) pending.minutesAfterMeal = minutes;
  if (/\byes\b/i.test(ctx.message) && pending.askedDiabetes) pending.secondaryValue = 1;
  if (/\b(no|not diabetic|don'?t have)\b/i.test(ctx.message) && pending.askedDiabetes) pending.secondaryValue = 0;

  const who = subject(ctx, { you: "your", other: (n) => `${n}'s` });
  if (pending.value == null) {
    return ask(ctx, pending, `What was ${who} latest reading, and was it fasting, before food, after food or random?`, ["Fasting", "Before a meal", "After a meal", "Random"]);
  }
  if (!pending.context) {
    return ask(ctx, pending, `Thanks. Was ${pending.value} mg/dL taken fasting, before a meal, after a meal, or at a random time?`, ["Fasting", "Before a meal", "After a meal", "Random", "Bedtime"]);
  }
  if (pending.context === "after_meal" && pending.minutesAfterMeal == null) {
    return ask(ctx, pending, "About how long after eating was it taken?", ["Within 1 hour", "About 2 hours", "3 hours or more"]);
  }

  // Use the profile record before asking about diabetes.
  const conditions = await patient.conditions();
  const meds = await patient.activeMedications();
  const diabetesKnown = conditions.some((c) => /diabet/i.test(c.name)) || meds.some((m) => /metformin|glimepiride|sitagliptin|insulin|gliflozin/i.test(m.name + " " + (m.generic_name ?? "")));
  let diagnosed: boolean | null = diabetesKnown ? true : pending.secondaryValue === 1 ? true : pending.secondaryValue === 0 ? false : null;
  if (diagnosed === null && !pending.askedDiabetes && conditions.length === 0) {
    return ask(ctx, { ...pending, askedDiabetes: true }, ctx.profile.relationship === "self" ? "Have you been diagnosed with diabetes?" : `Has ${ctx.profile.display_name} been diagnosed with diabetes?`, ["Yes", "No", "Not sure"]);
  }
  if (diagnosed === null) diagnosed = false;

  const rules = await loadClinicalRules();
  const context = pending.context === "after_meal" && (pending.minutesAfterMeal ?? 120) < 60 ? "random" : pending.context;
  const rule = selectMeasurementRule(rules, {
    type: "blood_glucose",
    value: pending.value,
    context,
    age: ctx.profile.age,
    sex: ctx.profile.sex,
    pregnancyStatus: ctx.profile.pregnancy_status,
    diagnosed,
    jurisdiction: ctx.countryCode,
  });
  if (rule) ctx.sources.rule(rule);

  // Measurement + symptoms combinations (e.g. very high sugar with confusion) go through triage.
  const triage = evaluateTriage(ctx.concepts, rules, rule ? [{ type: "blood_glucose", severity: rule.severity }] : []);
  for (const m of triage.matchedRules) ctx.sources.rule({ id: m.id, rule_key: m.rule_key, version: m.version, source: "triage" });
  if (triage.isEmergency) return emergencyResult(ctx, triage);

  const history = await patient.measurements("blood_glucose", { days: 30, limit: 20 });
  const sameCtx = history.filter((h) => h.context === pending.context);
  const hba1c = await patient.labHistory("HbA1c", 3);
  const instructions = await patient.doctorInstructions(["blood_glucose", "diabetes", "glucose"]);
  const knowledge = await retrieveDoctorKnowledge(ctx.doctor?.id ?? null, `blood glucose ${CONTEXT_LABEL[pending.context]} ${pending.value} mg/dL ${diagnosed ? "diabetes" : ""} what to do high sugar`, ctx.sources, { k: 2 });

  const afterMeal = pending.context === "after_meal" && pending.minutesAfterMeal ? `${pending.minutesAfterMeal >= 60 ? `${Math.round((pending.minutesAfterMeal / 60) * 10) / 10} h` : `${pending.minutesAfterMeal} min`} after a meal` : null;
  const contextLabel = afterMeal ?? CONTEXT_LABEL[pending.context]!;
  const severity = rule?.severity ?? "LOW";
  const avg = sameCtx.length ? Math.round(sameCtx.reduce((s, h) => s + h.value, 0) / sameCtx.length) : null;
  const trendSummary = sameCtx.length
    ? `${sameCtx.length} ${CONTEXT_NOUN[pending.context]} reading${sameCtx.length === 1 ? "" : "s"} in the last 30 days, averaging ${avg} mg/dL.`
    : "No earlier readings of this type in the last 30 days.";
  const isHigh = rule ? /high|above/i.test(rule.status_label) : false;
  const isLow = rule ? /low/i.test(rule.status_label) : false;

  const doctorGuidance = [
    ...instructions.map((i) => ({ text: i.instruction, source: `${i.doctor_name} · instruction for ${ctx.profile.display_name} (v${i.version})` })),
    ...knowledge.map((k) => ({ text: excerpt(k, "blood glucose sugar high after meal diabetes walk water"), source: `${k.doctor_name} · ${k.title} (v${k.version})` })),
  ];

  const card: MeasurementResultCard = {
    id: cardId(),
    type: "measurement_result",
    measurementType: "blood_glucose",
    value: pending.value,
    unit: "mg/dL",
    contextLabel,
    statusLabel: rule?.status_label ?? "No configured rule for this situation",
    severity,
    rule: rule ? { key: rule.rule_key, version: rule.version, source: rule.source } : null,
    trend: { points: [...history].reverse().map((h) => ({ t: new Date(h.measured_at).toISOString(), v: h.value })), summary: trendSummary },
    sections: {
      meaning: rule
        ? `${rule.status_label}. ${diagnosed ? "This comparison uses common targets for people with diabetes." : "This compares the reading with general reference ranges."} A single reading is one snapshot — patterns over several days are more meaningful.`
        : "We don't have an approved rule for this exact situation, so we can't classify it. Your doctor can interpret it with you.",
      whatYouCanDo: isHigh
        ? ["Drink water and avoid sugary drinks", "A gentle 10–15 minute walk can help if you feel well", "Take medicines exactly as prescribed — don't take extra doses on your own", "Recheck later and log the reading"]
        : isLow
          ? ["If you have a low-sugar plan from your doctor, follow it now", "Have a fast-acting sugar (e.g. glucose tablets or juice) if you're on diabetes medicine, then recheck in 15 minutes", "Don't drive until it's back to normal"]
          : ["Keep doing what you're doing", "Log readings at similar times to build a clear picture"],
      symptomsToWatch: isLow ? ["Shakiness, sweating or confusion", "Fainting or being hard to wake"] : ["Excessive thirst or passing a lot of urine", "Blurred vision", "Vomiting, stomach pain or fast breathing", "Confusion or unusual drowsiness"],
      whenToContact: rule?.recommended_action ?? "Contact your doctor if readings stay outside your target range.",
    },
    doctorGuidance,
    actions: [
      { label: "View trend", kind: "link", href: `/health/measurements?profile=${ctx.profile.id}&type=blood_glucose` },
      { label: hba1c.length ? "Upload new HbA1c" : "Upload HbA1c", kind: "upload_report" },
      { label: "Ask doctor", kind: "send_review" },
      { label: "Book appointment", kind: "link", href: `/appointments?new=1&profile=${ctx.profile.id}` },
    ],
  };

  const proposal: ChatCard = {
    id: cardId(),
    type: "record_proposal",
    kind: "measurement",
    profileId: ctx.profile.id,
    profileName: ctx.profile.display_name,
    label: `Save ${pending.value} mg/dL as ${ctx.profile.relationship === "self" ? "today's" : `${ctx.profile.display_name}'s`} ${CONTEXT_NOUN[pending.context]} glucose reading?`,
    payload: { measurementType: "blood_glucose", value: pending.value, context: pending.context, minutesAfterMeal: pending.minutesAfterMeal ?? null, source: "chat" },
    status: "pending",
  };
  const cards: ChatCard[] = [card, proposal];
  if (pending.secondaryValue === 1 && !diabetesKnown) {
    cards.push({ id: cardId(), type: "record_proposal", kind: "condition", profileId: ctx.profile.id, profileName: ctx.profile.display_name, label: `Add "Diabetes" to ${ctx.profile.display_name}'s health conditions?`, payload: { name: "Diabetes" }, status: "pending" });
  }

  const lines: string[] = [];
  lines.push(`${pending.value} mg/dL (${contextLabel.toLowerCase()}) — ${rule ? rule.status_label.toLowerCase() : "not classified"}.`);
  if (sameCtx.length) lines.push(trendSummary);
  if (hba1c.length) lines.push(`Latest HbA1c on record: ${hba1c[0]!.value}%${hba1c[1] ? ` (previously ${hba1c[1].value}%)` : ""}.`);
  if (doctorGuidance.length) lines.push(`I've included ${ctx.doctor?.name ?? "your doctor"}'s guidance below — it takes priority over general tips.`);
  lines.push("Would you like me to save this reading?");

  const review = severity !== "LOW" && (isHigh ? (sameCtx.filter((h) => h.value >= pending.value! * 0.9).length >= 2 || severity === "HIGH") : true);
  return {
    agent: "MeasurementAgent",
    text: lines.join(" "),
    cards,
    state: { ...ctx.state, pending: null, lastIntent: "measurements" },
    response: baseResponse(ctx, {
      urgency: severity,
      summary: `Blood glucose ${pending.value} mg/dL ${contextLabel}`,
      recommendations: card.sections.whatYouCanDo,
      redFlags: card.sections.symptomsToWatch,
      doctorReviewRecommended: review,
      doctorSpeciality: review ? "Endocrinology / General Practice" : null,
      suggestedActions: ["save_reading", "view_trend", "ask_doctor"],
      medicalSources: rule ? [`${rule.source} (rule ${rule.rule_key} v${rule.version})`] : [],
      doctorSources: doctorGuidance.map((d) => d.source),
      recordUpdates: [{ kind: "measurement", description: `blood_glucose ${pending.value} ${pending.context}` }],
    }),
  };
}

async function bloodPressureFlow(ctx: AgentContext, patient: PatientContextService, bp: { systolic: number; diastolic: number } | null): Promise<AgentResult> {
  const pending: Pending = ctx.state.pending?.kind === "blood_pressure" ? { ...ctx.state.pending } : { kind: "blood_pressure" };
  if (bp) {
    pending.value = bp.systolic;
    pending.secondaryValue = bp.diastolic;
  }
  if (pending.value == null || pending.secondaryValue == null) {
    return ask(ctx, pending, "What were the two numbers on the monitor? For example 130/85.", []);
  }
  const rules: ClinicalRule[] = await loadClinicalRules();
  const rule = selectMeasurementRule(rules, { type: "blood_pressure", value: pending.value, secondaryValue: pending.secondaryValue, age: ctx.profile.age, jurisdiction: ctx.countryCode });
  if (rule) ctx.sources.rule(rule);
  const triage = evaluateTriage(ctx.concepts, rules, rule ? [{ type: "blood_pressure", severity: rule.severity }] : []);
  for (const m of triage.matchedRules) ctx.sources.rule({ id: m.id, rule_key: m.rule_key, version: m.version, source: "triage" });
  if (triage.isEmergency) return emergencyResult(ctx, triage);

  const history = await patient.measurements("blood_pressure", { days: 30, limit: 20 });
  const instructions = await patient.doctorInstructions(["blood_pressure", "hypertension"]);
  const knowledge = await retrieveDoctorKnowledge(ctx.doctor?.id ?? null, `blood pressure ${pending.value}/${pending.secondaryValue} high reading what to do`, ctx.sources, { k: 2 });
  const severity = rule?.severity ?? "LOW";
  const veryHigh = severity === "HIGH";
  const card: MeasurementResultCard = {
    id: cardId(),
    type: "measurement_result",
    measurementType: "blood_pressure",
    value: pending.value,
    secondaryValue: pending.secondaryValue,
    unit: "mmHg",
    contextLabel: "Reading",
    statusLabel: rule?.status_label ?? "Not classified",
    severity,
    rule: rule ? { key: rule.rule_key, version: rule.version, source: rule.source } : null,
    trend: {
      points: [...history].reverse().map((h) => ({ t: new Date(h.measured_at).toISOString(), v: h.value, v2: h.secondary_value })),
      summary: history.length ? `${history.length} reading${history.length === 1 ? "" : "s"} in the last 30 days.` : "No earlier readings in the last 30 days.",
    },
    sections: {
      meaning: rule ? `${rule.status_label}. Blood pressure varies through the day, so one reading isn't a diagnosis.` : "We can't classify this reading with the current configuration.",
      whatYouCanDo: veryHigh
        ? ["Sit quietly for 5 minutes, then measure again", "Check for symptoms such as chest pain, breathlessness, severe headache, weakness or vision changes", "Take your usual medicines as prescribed"]
        : ["Rest for 5 minutes and recheck, seated with your arm supported at heart level", "Avoid caffeine and smoking 30 minutes before measuring", "Log morning and evening readings for a week"],
      symptomsToWatch: ["Chest pain", "Shortness of breath", "Severe headache", "Weakness or numbness on one side", "Vision changes or confusion"],
      whenToContact: rule?.recommended_action ?? "Share your readings with your doctor.",
    },
    doctorGuidance: [
      ...instructions.map((i) => ({ text: i.instruction, source: `${i.doctor_name} · instruction (v${i.version})` })),
      ...knowledge.map((k) => ({ text: excerpt(k, "blood pressure high reading recheck"), source: `${k.doctor_name} · ${k.title} (v${k.version})` })),
    ],
    actions: [
      { label: "View trend", kind: "link", href: `/health/measurements?profile=${ctx.profile.id}&type=blood_pressure` },
      { label: "Ask doctor", kind: "send_review" },
      { label: "Book appointment", kind: "link", href: `/appointments?new=1&profile=${ctx.profile.id}` },
    ],
  };
  const proposal: ChatCard = {
    id: cardId(),
    type: "record_proposal",
    kind: "measurement",
    profileId: ctx.profile.id,
    profileName: ctx.profile.display_name,
    label: `Save ${pending.value}/${pending.secondaryValue} mmHg as a blood-pressure reading for ${ctx.profile.display_name}?`,
    payload: { measurementType: "blood_pressure", value: pending.value, secondaryValue: pending.secondaryValue, source: "chat" },
    status: "pending",
  };
  const text = veryHigh
    ? `${pending.value}/${pending.secondaryValue} mmHg is ${rule?.status_label.toLowerCase()}. Please sit and rest for 5 minutes, then measure again. If there's chest pain, breathlessness, severe headache, weakness, or vision changes, get urgent medical help.`
    : `${pending.value}/${pending.secondaryValue} mmHg — ${rule?.status_label.toLowerCase() ?? "recorded"}. Would you like me to save it?`;
  return {
    agent: "MeasurementAgent",
    text,
    cards: [card, proposal],
    state: { ...ctx.state, pending: null, lastIntent: "measurements" },
    lockText: veryHigh,
    response: baseResponse(ctx, {
      urgency: severity,
      summary: `Blood pressure ${pending.value}/${pending.secondaryValue}`,
      recommendations: card.sections.whatYouCanDo,
      redFlags: card.sections.symptomsToWatch,
      doctorReviewRecommended: severity !== "LOW",
      doctorSpeciality: severity !== "LOW" ? "General Practice / Cardiology" : null,
      medicalSources: rule ? [`${rule.source} (rule ${rule.rule_key} v${rule.version})`] : [],
      doctorSources: card.doctorGuidance.map((d) => d.source),
      recordUpdates: [{ kind: "measurement", description: `blood_pressure ${pending.value}/${pending.secondaryValue}` }],
    }),
  };
}

async function trendResult(ctx: AgentContext, patient: PatientContextService, type: "blood_glucose" | "blood_pressure"): Promise<AgentResult> {
  const rows = await patient.measurements(type, { days: 90, limit: 60 });
  const label = type === "blood_glucose" ? "Blood sugar" : "Blood pressure";
  const unit = type === "blood_glucose" ? "mg/dL" : "mmHg";
  const summary = rows.length
    ? `${rows.length} readings in the last 3 months. Latest: ${rows[0]!.value}${rows[0]!.secondary_value ? "/" + rows[0]!.secondary_value : ""} ${unit}.`
    : `No ${label.toLowerCase()} readings yet for ${ctx.profile.display_name}.`;
  const actions: CardAction[] = [{ label: "Open full chart", kind: "link", href: `/health/measurements?profile=${ctx.profile.id}&type=${type}` }, { label: "Add reading", kind: "add_reading", value: type }];
  return {
    agent: "MeasurementAgent",
    text: summary,
    cards: [
      { id: cardId(), type: "trend", measurementType: type, label: `${label} · ${ctx.profile.display_name}`, unit, points: [...rows].reverse().map((r) => ({ t: new Date(r.measured_at).toISOString(), v: r.value, v2: r.secondary_value })), summary },
      { id: cardId(), type: "actions", actions },
    ],
    response: baseResponse(ctx, { summary }),
  };
}

function ask(ctx: AgentContext, pending: Pending, question: string, replies: string[]): AgentResult {
  return {
    agent: "MeasurementAgent",
    text: question,
    cards: replies.length ? [quick(replies)] : [],
    state: { ...ctx.state, pending, lastIntent: "measurements" },
    response: baseResponse(ctx, { clarifyingQuestions: [question], summary: "Collecting measurement context" }),
  };
}
