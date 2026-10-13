import "server-only";
import { getDb } from "@/lib/database/client";
import { getEmergencyConfig } from "@/lib/clinical/emergency-config";
import { getClinicalTerminology } from "@/lib/integrations/terminology/clinical";
import { getProviderSearch } from "@/lib/integrations/providers";
import { getReport } from "@/lib/services/reports";
import { getSavedCity, saveCity } from "@/lib/services/my-doctor";
import { formatDate } from "@/lib/utils/format";
import { PatientContextService } from "../services/patient-context";
import { baseResponse, cardId, type AgentContext, type AgentResult } from "../agents/context";
import { emergencyResult } from "../agents/safety";
import { withEnglishReading } from "@/lib/clinical/lexicon";
import { recordAssessment } from "@/lib/services/assessment-audit";
import { measurementAgent } from "../agents/measurement-agent";
import type { ChatCard, QuestionCard } from "../types";
import { COMPLAINT_LABEL, complaintPhrase, decide, matchTypedAnswer, applyAnswer, type PatientFacts } from "./symptom-engine";
import { categoryFromText, mentionedSubject, seedFromStart, type GuidedStart } from "./detect";
import { RELATED_LAB, VALUE_TESTS } from "./test-ranges";
import { emptyState, type GuidedFlow, type GuidedState, type QuestionDef, type StructuredAnswer } from "./types";
import { applyBabyAnswer, babyDecide } from "./baby-engine";
import { applyVetAnswer, vetDecide } from "./vet-engine";
import { reviewPhotoFile, type ImageFindings } from "./photo";
import { recordFollowUpOutcome, scheduleFollowUp } from "@/lib/services/follow-ups";
import { setActiveProfile } from "@/lib/services/conversations";
import { ageFromDob } from "@/lib/utils/format";
import type { CareLevelKey } from "../types";
import type { Profile } from "@/types/domain";

export type GuidedOutcome = AgentResult | { reroute: string };

const AGENT = "HealthGuide";

function questionCard(def: QuestionDef): QuestionCard {
  const { text: _text, ...rest } = def;
  return { id: cardId(), type: "question", status: "open", ...rest };
}

function ask(ctx: AgentContext, state: GuidedState, def: QuestionDef, lead?: string): AgentResult {
  const next = { ...state, pending: def.key, asked: state.asked.includes(def.key) ? state.asked : [...state.asked, def.key] };
  return {
    agent: AGENT,
    text: lead ? `${lead} ${def.text}` : def.text,
    cards: [questionCard(def)],
    lockText: true,
    state: { ...ctx.state, guided: next, pending: null, symptomFlow: null, lastIntent: "guided" },
    response: baseResponse(ctx, { intent: state.flow === "symptom" ? "symptoms" : state.flow === "test_result" ? "measurements" : state.flow === "report" ? "reports" : "general_health", clarifyingQuestions: [def.text], summary: `Guided question: ${def.key}` }),
  };
}

async function facts(ctx: AgentContext, state?: GuidedState): Promise<PatientFacts> {
  const p = state?.patient;
  if (p && !p.saved && (p.kind === "adult" || p.kind === "child")) return { name: p.label, isSelf: false, age: p.ageYears ?? null, sex: null, pregnant: false, conditions: [] };
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const conditions = await patient.conditions();
  return {
    name: ctx.profile.display_name,
    isSelf: ctx.profile.relationship === "self",
    age: ctx.profile.age,
    sex: ctx.profile.sex,
    pregnant: ctx.profile.pregnancy_status === "pregnant",
    conditions: conditions.map((c) => c.name),
  };
}

/** Name a profile the way the chat speaks: "you" for the account holder, otherwise their name. */
const you = (ctx: AgentContext, self: string, other: string) => (ctx.profile.relationship === "self" ? self : other.replace("{name}", ctx.profile.display_name));

// ------------------------------------------------------------------------------------------------- who is this about?

type Mode = "human" | "baby" | "pet";

function profileAgeMonths(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) - (now.getDate() < d.getDate() ? 1 : 0);
}

/** Adult/child questions, baby safety mode (under 12 months) or veterinary mode. */
function modeFor(ctx: AgentContext, state: GuidedState): Mode {
  const p = state.patient;
  if (p && !p.saved) return p.kind === "pet" ? "pet" : p.kind === "baby" ? "baby" : "human";
  if (ctx.profile.relationship === "pet") return "pet";
  const m = profileAgeMonths(ctx.profile.date_of_birth);
  return m != null && m < 12 ? "baby" : "human";
}

/** How the chat names the patient in questions ("your baby", "Bruno", "Mom"). */
function patientName(ctx: AgentContext, state: GuidedState) {
  const p = state.patient;
  if (p && !p.saved) return p.label;
  return ctx.profile.relationship === "self" ? "you" : ctx.profile.display_name;
}

/** For a saved baby or pet profile, carry its age / species into the engine state. */
function withProfileFacts(ctx: AgentContext, state: GuidedState, mode: Mode): GuidedState {
  if (state.patient && !state.patient.saved) return state;
  if (mode === "baby" && state.patient?.ageMonths == null) return { ...state, patient: { kind: "baby", label: ctx.profile.display_name, saved: true, ageMonths: Math.max(0.5, profileAgeMonths(ctx.profile.date_of_birth) ?? 6) } };
  if (mode === "pet" && !state.patient?.species) return { ...state, patient: { kind: "pet", label: ctx.profile.display_name, saved: true, species: ctx.profile.species ?? "other" } };
  return state;
}

function whoForQuestion(ctx: AgentContext): QuestionDef {
  const profiles = ctx.familyProfiles;
  const hasBaby = profiles.some((p) => p.relationship !== "pet" && (profileAgeMonths(p.date_of_birth) ?? 999) < 12);
  const hasPet = profiles.some((p) => p.relationship === "pet");
  const order = (p: Profile) => (p.relationship === "self" ? 0 : p.relationship === "pet" ? 2 : 1);
  return {
    key: "who_for",
    text: "Who is this about?",
    style: "chips",
    options: [
      ...[...profiles].sort((a, b) => order(a) - order(b)).map((p) => ({ label: p.relationship === "self" ? `${p.display_name} (me)` : p.display_name, value: `profile:${p.id}` })),
      ...(hasBaby ? [] : [{ label: "My baby", value: "baby" }]),
      ...(hasPet ? [] : [{ label: "My pet", value: "pet" }]),
      { label: "Someone else", value: "someone" },
    ],
  };
}

async function chooseWho(ctx: AgentContext, prev: GuidedState, a: StructuredAnswer): Promise<AgentResult> {
  let state: GuidedState = { ...prev, answers: { ...prev.answers, [a.key]: a.value }, asked: prev.asked.includes(a.key) ? prev.asked : [...prev.asked, a.key], pending: null };
  const v = a.value;
  if (a.key === "who_for" && v.startsWith("profile:")) {
    const id = v.slice(8);
    const target = ctx.familyProfiles.find((p) => p.id === id);
    if (target && target.id !== ctx.profile.id) {
      await setActiveProfile(ctx.actor, ctx.conversation.id, target.id);
      ctx.profile = { ...target, age: ageFromDob(target.date_of_birth) };
      state.activeProfileId = target.id;
    }
    state.patient = null;
  } else if (v === "baby") state.patient = { kind: "baby", label: "your baby", saved: false };
  else if (v === "pet") state.patient = { kind: "pet", label: "your pet", saved: false };
  else if (v === "someone")
    return ask(ctx, state, {
      key: "someone_age",
      text: "How old are they?",
      style: "chips",
      options: [
        { label: "Under 1 year", value: "baby" },
        { label: "1–12 years", value: "6" },
        { label: "13–17 years", value: "15" },
        { label: "18–64 years", value: "40" },
        { label: "65 or older", value: "72" },
      ],
    });
  else if (a.key === "someone_age") state.patient = v === "baby" ? { kind: "baby", label: "the baby", saved: false } : { kind: Number(v) < 13 ? "child" : "adult", label: Number(v) < 13 ? "the child" : "this person", saved: false, ageYears: Number(v) };
  const mode = modeFor(ctx, state);
  state = prefillCategory(withProfileFacts(ctx, state, mode), mode);
  return symptomStep(ctx, state);
}

const CATEGORY_PHRASE: Record<string, string> = {
  fever: "fever", feeding: "not feeding well", breathing: "breathing problem", vomiting: "vomiting", diarrhoea: "loose motions", rash: "rash", sleepy: "very sleepy", crying: "crying a lot",
  not_eating: "not eating", poison: "possible poisoning", injury: "injury", urine: "straining to pee", skin: "skin or ear problem", limping: "limping", lethargy: "low energy", other: "health concern",
};

/** Every completed or escalated guided assessment goes to the audit log. */
function audit(ctx: AgentContext, state: GuidedState, mode: Mode, careLevel: string, speciality: string | null, redFlags: string[], possibilities: string[]) {
  return recordAssessment({
    familyId: ctx.familyId,
    profileId: state.patient && !state.patient.saved ? null : ctx.profile.id,
    conversationId: ctx.conversation.id,
    flow: mode,
    complaint: state.complaint ?? state.symptomType ?? null,
    answers: state.answers,
    redFlags,
    careLevel,
    speciality,
    possibilities,
    ruleVersions: ctx.sources.rules.map((r) => ({ rule_key: r.rule_key, version: r.version })),
  });
}

/** Crisis-line wording for someone who has thoughts of not wanting to be alive but is safe right now. */
function supportLine(ctx: AgentContext) {
  const cfg = getEmergencyConfig(ctx.countryCode);
  const line = cfg.crisisLine ? `${cfg.crisisLine.label} on ${cfg.crisisLine.number}` : "a crisis line";
  return `Thank you for telling me. If these thoughts get stronger, or you feel you might act on them, call ${line} or emergency services on ${cfg.emergencyNumber} straight away. It can also help to tell someone you trust how you're feeling today.`;
}

function careLevelFor(level: string): CareLevelKey {
  return level === "emergency" ? "emergency" : level === "urgent" ? "same_day" : level === "self_care" ? "monitor" : "clinician";
}

// ------------------------------------------------------------------------------------------------- entry

/**
 * Handles one turn of a guided (tap-to-answer) flow. `answer` is a structured tap; `freeText` is typed text
 * while a guided question is open; `start` seeds a symptom flow detected from free text.
 */
export async function guidedAgent(ctx: AgentContext, input: { answer?: StructuredAnswer; freeText?: string; start?: GuidedStart | null }): Promise<GuidedOutcome | null> {
  let answer = input.answer;
  const current = ctx.state.guided ?? null;

  // A typed reply to "How are you feeling now?"
  if (!answer && input.freeText != null && ctx.state.followUpId) {
    const m = matchTypedAnswer({ style: "chips", options: [{ label: "Better", value: "better" }, { label: "About the same", value: "same" }, { label: "Worse", value: "worse" }, { label: "New symptoms", value: "new" }] }, input.freeText);
    const t = input.freeText.toLowerCase();
    const value = m?.value ?? (/\b(better|improv|good|fine|ok(ay)?)\b/.test(t) ? "better" : /\b(worse|bad|terrible)\b/.test(t) ? "worse" : /\b(same|no change|not better)\b/.test(t) ? "same" : null);
    if (value) answer = { key: "followup_status", value, label: input.freeText };
  }

  // After a flow has finished, its follow-up chips are optional: typed text starts a normal conversation.
  if (!answer && input.freeText != null && current?.done) return input.start ? startSymptom(ctx, input.start, input.freeText) : null;

  // Typed text while a question is open: map it onto the options when possible.
  if (!answer && input.freeText != null && current?.pending) {
    const pendingCard = lastQuestion(ctx);
    if (pendingCard) {
      if (pendingCard.style === "number") {
        const nums = input.freeText.match(/\d+(\.\d+)?/g);
        if (nums?.length) answer = { key: pendingCard.key, value: pendingCard.number?.secondary && nums[1] ? `${nums[0]}/${nums[1]}` : nums[0]!, label: input.freeText };
        else if (pendingCard.options.some((o) => o.value === "skip") && /\b(don'?t|do not|no|skip|not sure|unknown|n\/a)\b/i.test(input.freeText)) answer = { key: pendingCard.key, value: "skip", label: input.freeText };
      } else if (pendingCard.style === "location") {
        answer = { key: "city", value: input.freeText.trim(), label: input.freeText.trim() };
      } else {
        const m = matchTypedAnswer(pendingCard, input.freeText);
        if (m) answer = { key: pendingCard.key, value: m.value, label: m.label };
        else if (pendingCard.allowText) answer = { key: pendingCard.key, value: input.freeText.trim().slice(0, 200), label: input.freeText };
      }
    }
    if (!answer) {
      if (input.start) return startSymptom(ctx, input.start, input.freeText);
      // Unmatched text: keep it as a note and re-ask the same question gently.
      if (current && pendingCard) {
        const st = { ...current, notes: [...current.notes, input.freeText.slice(0, 300)] };
        const { key, style, options, number, allowText, textPlaceholder } = pendingCard;
        return ask(ctx, st, { key, style, options, number, allowText, textPlaceholder, text: "Thanks, I've noted that. To help me further:" + " " + questionText(ctx, pendingCard) });
      }
      return null;
    }
  }

  if (!answer && input.start) return startSymptom(ctx, input.start, input.freeText ?? "");
  if (!answer) return null;

  switch (answer.key) {
    case "start":
      return startFlow(ctx, answer.value as GuidedFlow);
    case "find_doctor":
      return findDoctor(ctx, answer.value);
    case "city":
      return searchDoctors(ctx, answer.value);
    case "change_city":
      return askCity(ctx, { ...(current ?? emptyState("find_doctor", ctx.profile.id)), flow: "find_doctor", speciality: answer.value || current?.speciality || "General Physician" }, "No problem.");
    case "doctor_not_now":
      return {
        agent: AGENT,
        text: "No problem. I'm here whenever you want to talk about anything else.",
        cards: [questionCard({ key: "after_care", text: "", style: "chips", options: [{ label: "Check another symptom", value: "symptom" }, { label: "Ask a health question", value: "question" }] })],
        lockText: true,
        state: { ...ctx.state, guided: current ? { ...current, pending: "after_care" } : null },
        response: baseResponse(ctx, { summary: "Doctor search declined" }),
      };
    case "after_care":
      if (answer.value.startsWith("find:")) return findDoctor(ctx, answer.value.slice(5));
      if (answer.value.startsWith("checkin:")) return scheduleCheckIn(ctx, current, Number(answer.value.slice(8)));
      return startFlow(ctx, answer.value as GuidedFlow);
    case "report_file":
      return reviewReport(ctx, answer.value);
    case "followup_status":
      return followUpAnswer(ctx, answer.value as "better" | "same" | "worse" | "new");
    case "followup_worse":
      return followUpWorse(ctx, answer.value);
    case "photo_file":
      return photoStep(ctx, answer.value);
    case "photo_subject":
      return symptomFromPhoto(ctx, current ?? emptyState("symptom", ctx.profile.id), answer.value as PhotoSubject, "");
    case "question_suggest":
      return { reroute: answer.value };
  }

  const state = current ?? emptyState("symptom", ctx.profile.id);
  if (state.flow === "symptom") {
    if (answer.key === "who_for" || answer.key === "someone_age") return chooseWho(ctx, state, answer);
    const mode = modeFor(ctx, state);
    return symptomStep(ctx, mode === "baby" ? applyBabyAnswer(state, answer) : mode === "pet" ? applyVetAnswer(state, answer) : applyAnswer(state, answer));
  }
  if (state.flow === "test_result") return testStep(ctx, state, answer);
  if (state.flow === "question") return questionStep(ctx, state, answer);
  if (state.flow === "report") {
    if (answer.key === "report_followup") return { reroute: answer.value };
    return null;
  }
  return null;
}

function lastQuestion(ctx: AgentContext): QuestionCard | null {
  for (let i = ctx.history.length - 1; i >= 0; i--) {
    const m = ctx.history[i]!;
    if (m.role !== "assistant") continue;
    return (m.cards.find((c) => c.type === "question" && c.status === "open") as QuestionCard | undefined) ?? null;
  }
  return null;
}

function questionText(ctx: AgentContext, card: QuestionCard): string {
  for (let i = ctx.history.length - 1; i >= 0; i--) {
    const m = ctx.history[i]!;
    if (m.role === "assistant" && m.cards.some((c) => c.id === card.id)) return m.content.split(/(?<=[.!])\s+/).pop() ?? m.content;
  }
  return "";
}

// ------------------------------------------------------------------------------------------------- starts

async function startFlow(ctx: AgentContext, flow: GuidedFlow): Promise<GuidedOutcome> {
  const state = emptyState(flow, ctx.profile.id);
  if (flow === "symptom") return ask(ctx, state, whoForQuestion(ctx));
  if (flow === "report")
    return ask(ctx, state, {
      key: "report_source",
      text: you(ctx, "Sure. Upload the report you'd like me to look at.", "Sure. Upload {name}'s report and I'll look at it."),
      style: "upload",
      options: [
        { label: "Take Photo", value: "camera" },
        { label: "Upload PDF", value: "upload" },
        { label: "Choose from Reports", value: "pick" },
      ],
    });
  if (flow === "test_result")
    return ask(ctx, state, {
      key: "test_pick",
      text: "What result would you like help understanding?",
      style: "chips",
      options: [
        { label: "Blood Sugar", value: "blood_sugar" },
        { label: "Blood Pressure", value: "blood_pressure" },
        { label: "HbA1c", value: "hba1c" },
        { label: "Cholesterol", value: "cholesterol" },
        { label: "Thyroid", value: "thyroid" },
        { label: "CBC / Blood Count", value: "cbc" },
        { label: "Other", value: "other" },
      ],
    });
  return ask(ctx, state, {
    key: "question_topic",
    text: "What would you like help with?",
    style: "chips",
    options: [
      { label: "Diet", value: "diet" },
      { label: "Exercise", value: "exercise" },
      { label: "Sleep", value: "sleep" },
      { label: "General Health", value: "general" },
      { label: "Medicine Question", value: "medicine" },
      { label: "Other", value: "other" },
    ],
  });
}

async function startSymptom(ctx: AgentContext, start: GuidedStart, text: string): Promise<GuidedOutcome> {
  const seeded = seedFromStart({ ...emptyState("symptom", ctx.profile.id), notes: text ? [text.slice(0, 300)] : [] }, start);
  // "My baby…" / "My dog…": confirm who it's about unless the conversation is already about a baby / pet.
  const subject = text ? mentionedSubject(text) : null;
  if (subject) {
    const mode = modeFor(ctx, seeded);
    if ((subject === "pet" && mode === "pet") || (subject === "baby" && mode === "baby")) return symptomStep(ctx, prefillCategory(seeded, mode));
    // "My baby is two months old and has a temperature of 38.2°C": age and temperature are already given, so
    // the baby safety rules run straight away instead of asking who it's about first.
    const baby = subject === "baby" ? babyFactsFromText(text) : null;
    if (baby?.ageMonths != null && baby.ageMonths < 12) {
      const state: GuidedState = { ...seeded, patient: { kind: "baby", label: "your baby", saved: false, ageMonths: baby.ageMonths }, answers: { ...seeded.answers, who_for: "baby", ...(baby.temp ? { baby_temp: baby.temp } : {}) }, asked: [...seeded.asked, "who_for"] };
      return symptomStep(ctx, prefillCategory(state, "baby"));
    }
    return ask(ctx, seeded, whoForQuestion(ctx), "I can help with that.");
  }
  return symptomStep(ctx, seeded);
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11 };

/** Age ("two months old", "6-week-old") and temperature ("38.2°C", "101 F") of a baby, from free text. */
export function babyFactsFromText(text: string): { ageMonths: number | null; temp: string | null } {
  const t = withEnglishReading(text).toLowerCase();
  const m = t.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven)[\s-]*(months?|mo|weeks?|wks?|days?)[\s-]*old\b/) ?? t.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven)[\s-]*(months?|weeks?|days?)\b/);
  let ageMonths: number | null = null;
  if (m) {
    const n = Number(m[1]) || NUMBER_WORDS[m[1]!] || 0;
    ageMonths = /^w/.test(m[2]!) ? Math.max(0.25, n / 4.35) : /^d/.test(m[2]!) ? 0.25 : n;
  }
  const tm = t.match(/\b(\d{2,3}(?:\.\d)?)\s*°?\s*(c|f|celsius|fahrenheit)?\b/);
  let temp: string | null = null;
  if (tm && /temp|fever|°|celsius|fahrenheit|\bc\b|\bf\b/.test(t)) {
    let v = Number(tm[1]);
    if (tm[2]?.startsWith("f") || v >= 90) v = (v - 32) * (5 / 9);
    if (v >= 34 && v <= 44) temp = v >= 39 ? "39_plus" : v >= 38 ? "38_39" : "under_38";
  }
  return { ageMonths, temp };
}

/** Uses the words of the first message to skip an already-answered category question. */
function prefillCategory(state: GuidedState, mode: Mode): GuidedState {
  if (mode === "human" || state.symptomType) return state;
  const cat = state.notes[0] ? categoryFromText(state.notes[0], mode) : null;
  if (!cat) return state;
  const key = mode === "baby" ? "baby_category" : "pet_category";
  return { ...state, symptomType: cat, answers: { ...state.answers, [key]: cat } };
}

// ------------------------------------------------------------------------------------------------- symptom flow

async function symptomStep(ctx: AgentContext, input: GuidedState): Promise<AgentResult> {
  const mode = modeFor(ctx, input);
  const state = withProfileFacts(ctx, input, mode);
  const f = await facts(ctx, state);
  state.knownConditions = f.conditions;
  const name = patientName(ctx, state);
  // "Yes, and I might act on them": the crisis response comes first, with no more questions.
  if (mode === "human" && (state.answers.mood_safety === "active" || (state.answers.preg_redflags ?? "").split("|").includes("harm"))) {
    const label = f.isSelf ? "Thoughts of ending their life" : `Worried ${f.name} may act on thoughts of ending their life`;
    const r = await emergencyResult(ctx, { level: "EMERGENCY", matchedRules: [{ id: "guided.mood_safety", rule_key: "guided.mood_safety", version: 1, severity: "EMERGENCY", label, action: "Contact a crisis line or emergency services now." }], redFlags: [label], crisis: true, isEmergency: true });
    r.state = { ...r.state, guided: { ...state, pending: null, done: true, urgency: "emergency" } };
    await audit(ctx, state, mode, "emergency", null, [label], []);
    return r;
  }
  const d = mode === "baby" ? babyDecide(state, name) : mode === "pet" ? vetDecide(state, name) : decide(state, f);
  if (d.kind === "ask") {
    const answered = state.asked.filter((k) => state.answers[k] != null);
    const last = answered.at(-1);
    let lead: string | undefined;
    if (mode !== "human" && (last === "baby_category" || last === "pet_category")) lead = `I'm sorry ${name === "you" ? "you're" : `${name} is`} not well.`;
    else if (mode !== "human") lead = undefined;
    else if (state.complaint && (answered.length === 0 || last === "symptom_category" || last === "stomach_type")) lead = f.isSelf ? "I'm sorry you're dealing with this." : `I'm sorry ${f.name} isn't feeling well.`;
    else if (d.question.key === "chest_redflags") lead = "Thanks. I need to check something important first.";
    else if (d.question.style === "multi" && answered.length >= 2) lead = "Thanks. Just a couple more things.";
    else if (answered.length === 3) lead = "Thanks, that helps.";
    if (d.question.key === "symptom_category" || d.question.key === "pet_danger" || d.question.key === "baby_danger") lead = d.question.key === "symptom_category" ? undefined : lead;
    return ask(ctx, state, d.question, lead);
  }
  if (d.kind === "escalate") await audit(ctx, state, mode, d.level === "emergency" ? "emergency" : "same_day", null, d.reasons, []);
  if (d.kind === "escalate") return escalate(ctx, { ...state, urgency: d.level, redFlags: [...new Set([...state.redFlags, ...d.reasons])], pending: null, done: true }, d.level, d.reasons, mode === "pet" ? "vet" : mode === "baby" ? "baby" : "human");

  const o = d.outcome;
  await audit(ctx, state, mode, careLevelFor(o.level), o.speciality, [], o.possibilities ?? []);
  const done: GuidedState = { ...state, urgency: o.level, recommendedNextStep: o.speciality ? `See a ${o.speciality}` : "Self-care", speciality: o.speciality, pending: null, done: true };
  const unsaved = !!state.patient && !state.patient.saved;
  const phrase = mode === "human" ? complaintPhrase(state) : CATEGORY_PHRASE[state.symptomType ?? "other"] ?? "health concern";
  const cards: ChatCard[] = [
    { id: cardId(), type: "care_level", level: careLevelFor(o.level), audience: mode === "pet" ? "vet" : "human" },
    ...(mode === "human" && o.summary.length > 1 ? [{ id: cardId(), type: "info" as const, tone: "info" as const, title: "What I've understood", body: o.summary.map((l) => `• ${l}`).join("\n") }] : []),
    ...(o.possibilities?.length
      ? [{ id: cardId(), type: "info" as const, tone: "info" as const, title: "What this could be", body: `There are several possible causes. Based on what you've told me, they include:\n${o.possibilities.map((l) => `• ${l.charAt(0).toUpperCase()}${l.slice(1)}`).join("\n")}\n\nThis isn't a diagnosis — a clinician may need to examine ${f.isSelf ? "you" : f.name} to tell these apart.` }]
      : []),
    ...(state.answers.mood_safety === "passive"
      ? [{ id: cardId(), type: "info" as const, tone: "warning" as const, title: "Support is there any time", body: supportLine(ctx) }]
      : []),
    { id: cardId(), type: "info", tone: "success", title: "What you can do now", body: o.selfCare.map((l) => `• ${l}`).join("\n") },
    { id: cardId(), type: "info", tone: "warning", title: "Get urgent help if you notice", body: o.watchFor.map((l) => `• ${l}`).join("\n") },
  ];
  done.summaryTopic = phrase;
  if (o.speciality) {
    cards.push({ id: cardId(), type: "doctor_recommendation", speciality: o.speciality, reason: o.reason, timing: o.timing, profileId: ctx.profile.id, status: "open" });
    if (!unsaved) cards.push(questionCard({ key: "after_care", text: "", style: "chips", options: [{ label: "Check in with me tomorrow", value: "checkin:24" }, { label: "Check in in 3 days", value: "checkin:72" }] }));
  } else cards.push(questionCard({ key: "after_care", text: "", style: "chips", options: [...(unsaved ? [] : [{ label: "Check in with me tomorrow", value: "checkin:24" }]), { label: mode === "pet" ? "Find a vet anyway" : "Find a doctor anyway", value: `find:${mode === "pet" ? "Veterinarian" : mode === "baby" ? "Paediatrician" : "General Physician"}` }, { label: "Check another symptom", value: "symptom" }, { label: "Ask a health question", value: "question" }] }));
  if (unsaved && (state.patient?.kind === "baby" || state.patient?.kind === "pet"))
    cards.push({ id: cardId(), type: "actions", actions: [{ label: state.patient.kind === "pet" ? "Add a profile for your pet" : "Add a profile for your baby", kind: "link", href: `/family?new=${state.patient.kind === "pet" ? "pet" : "child"}` }] });
  if (!unsaved) cards.push({
    id: cardId(),
    type: "record_proposal",
    kind: "symptom",
    profileId: ctx.profile.id,
    profileName: ctx.profile.display_name,
    label: `Save "${phrase}" to ${you(ctx, "your", "{name}'s")} health history?`,
    payload: { description: `${o.summary[0] ?? phrase}${state.severity ? ` · ${state.severity}` : ""}`, concepts: [state.complaint ?? state.symptomType ?? "symptom"], conversationId: ctx.conversation.id },
    status: "pending",
  });
  const tail = o.timing === "soon" && o.speciality ? " Try to see them within a day or two." : "";
  return {
    agent: AGENT,
    text: o.headline + tail,
    cards,
    lockText: true,
    state: { ...ctx.state, guided: done, lastIntent: "symptoms" },
    response: baseResponse(ctx, {
      intent: "symptoms",
      urgency: o.level === "self_care" ? "LOW" : "MODERATE",
      summary: o.summary.join("; "),
      selfCare: o.selfCare,
      redFlags: o.watchFor,
      doctorReviewRecommended: !!o.speciality,
      doctorSpeciality: o.speciality,
      recordUpdates: unsaved ? [] : [{ kind: "symptom", description: phrase }],
    }),
  };
}

async function escalate(ctx: AgentContext, state: GuidedState, level: "emergency" | "urgent", reasons: string[], audience: "human" | "baby" | "vet" = "human"): Promise<AgentResult> {
  const cfg = getEmergencyConfig(ctx.countryCode);
  const careCard: ChatCard = { id: cardId(), type: "care_level", level: level === "emergency" ? "emergency" : "same_day", audience: audience === "vet" ? "vet" : "human" };
  if (audience === "vet") {
    const name = patientName(ctx, state);
    return {
      agent: "TriageSafetyEngine",
      text: level === "emergency" ? `This may need emergency veterinary care. Please contact your vet or the nearest emergency vet hospital now rather than continuing here. If ${name === "your pet" ? "your pet" : name} may have eaten something harmful, don't make them vomit unless a vet tells you to.` : `${name === "your pet" ? "Your pet" : name} should be seen by a vet today. Please call your vet or an emergency vet clinic today — don't wait to see if it settles.`,
      lockText: true,
      cards: [careCard, { id: cardId(), type: "emergency", level, audience: "vet", title: level === "emergency" ? "This may need emergency vet care" : "Please see a vet today", message: level === "emergency" ? "Some of what you've described can be serious for an animal and needs prompt care." : "What you've described isn't something to wait on.", reasons, countryName: cfg.countryName, emergencyNumber: cfg.emergencyNumber, ambulanceNumber: null, crisisLine: null, emergencyContact: null, profileId: ctx.profile.id, profileName: name }],
      state: { ...ctx.state, guided: state, pending: null, symptomFlow: null, lastIntent: "symptoms" },
      response: baseResponse(ctx, { intent: "symptoms", urgency: level === "emergency" ? "EMERGENCY" : "HIGH", summary: `Vet ${level}: ${reasons.join("; ")}`, redFlags: reasons, doctorReviewRecommended: true, doctorSpeciality: "Veterinarian" }),
    };
  }
  const db = await getDb();
  const contact = (await db.query<{ name: string; phone: string }>("select name, phone from emergency_contacts where profile_id = $1 order by is_primary desc limit 1", [ctx.profile.id])).rows[0] ?? null;
  const emergency = level === "emergency";
  const baby = audience === "baby";
  const babyNewbornFever = reasons.some((r) => r.includes("under 3 months"));
  const text = baby && !emergency
    ? babyNewbornFever
      ? "A baby under 3 months with a temperature of 38°C (100.4°F) or higher needs prompt medical assessment. Please contact your paediatrician or go to an emergency department now — don't treat this as an ordinary feeding or fever problem."
      : `${patientName(ctx, state) === "you" ? "This" : "The baby"} should be checked by a doctor today. Please contact your paediatrician or an emergency department today — don't wait to see if it settles. If the baby gets worse, call ${cfg.emergencyNumber}.`
    : emergency
    ? `This may need urgent medical attention. Based on what you've described, please call emergency services (${cfg.emergencyNumber}) or go to the nearest emergency department now.${ctx.profile.relationship === "self" ? " Don't drive yourself." : ""}`
    : `This should be checked by a doctor today. Please contact your doctor or visit an urgent care clinic or emergency department today — don't wait to see if it settles. If it gets worse, call ${cfg.emergencyNumber}.`;
  return {
    agent: "TriageSafetyEngine",
    text,
    lockText: true,
    cards: [
      careCard,
      {
        id: cardId(),
        type: "emergency",
        level,
        title: emergency ? "This may need urgent medical attention" : "Please get checked today",
        message: emergency ? "Some of what you've described can be a sign of a serious problem that needs prompt care." : "What you've described isn't something to wait on.",
        reasons,
        countryName: cfg.countryName,
        emergencyNumber: cfg.emergencyNumber,
        ambulanceNumber: cfg.ambulanceNumber ?? null,
        crisisLine: null,
        emergencyContact: contact,
        profileId: ctx.profile.id,
        profileName: ctx.profile.display_name,
      },
    ],
    state: { ...ctx.state, guided: state, pending: null, symptomFlow: null, lastIntent: emergency ? "emergency" : "symptoms" },
    response: baseResponse(ctx, { intent: emergency ? "emergency" : "symptoms", urgency: emergency ? "EMERGENCY" : "HIGH", summary: `${emergency ? "Possible emergency" : "Urgent"}: ${reasons.join("; ")}`, redFlags: reasons, doctorReviewRecommended: true }),
  };
}

/** Emergency signs typed about a pet go to emergency VET care, never to human emergency numbers. */
export async function vetEmergencyFromText(ctx: AgentContext, reasons: string[]): Promise<AgentResult> {
  const pet = ctx.profile.relationship === "pet";
  const state: GuidedState = { ...emptyState("symptom", ctx.profile.id), patient: pet ? { kind: "pet", label: ctx.profile.display_name, saved: true, species: ctx.profile.species ?? null } : { kind: "pet", label: "your pet", saved: false }, done: true };
  return escalate(ctx, state, "emergency", reasons, "vet");
}

// ------------------------------------------------------------------------------------------------- check-ins

async function scheduleCheckIn(ctx: AgentContext, state: GuidedState | null, hours: number): Promise<AgentResult> {
  const topic = state?.summaryTopic ?? (/^new (health )?chat$/i.test(ctx.conversation.title) ? "symptoms" : ctx.conversation.title.toLowerCase());
  await scheduleFollowUp(ctx.actor, { profileId: ctx.profile.id, conversationId: ctx.conversation.id, topic, speciality: state?.speciality ?? null, hours });
  const when = hours <= 8 ? "later today" : hours <= 30 ? "tomorrow" : `in ${Math.round(hours / 24)} days`;
  return {
    agent: AGENT,
    text: `Okay — I'll ask how ${ctx.profile.relationship === "self" ? "you're" : `${ctx.profile.display_name} is`} doing ${when}, the next time you open Kinwell after that. If anything gets worse before then, don't wait — come back or get help.`,
    cards: [],
    lockText: true,
    state: { ...ctx.state, guided: state ? { ...state, pending: null } : null },
    response: baseResponse(ctx, { summary: `Check-in scheduled ${when}` }),
  };
}

async function followUpAnswer(ctx: AgentContext, outcome: "better" | "same" | "worse" | "new"): Promise<GuidedOutcome> {
  const id = ctx.state.followUpId;
  const f = id ? await recordFollowUpOutcome(ctx.actor, id, outcome) : null;
  const topic = f?.topic ?? "this";
  const vet = ctx.profile.relationship === "pet";
  const base = { ...ctx.state, followUpId: null };
  if (outcome === "better")
    return {
      agent: AGENT,
      text: `That's good to hear. Keep an eye on the ${topic}, and come back any time if it changes.`,
      cards: [{ id: cardId(), type: "care_level", level: "monitor", audience: vet ? "vet" : "human" }],
      lockText: true,
      state: base,
      response: baseResponse(ctx, { summary: `Check-in: ${topic} better` }),
    };
  if (outcome === "same") {
    const speciality = f?.speciality ?? (vet ? "Veterinarian" : ctx.profile.age != null && ctx.profile.age < 14 ? "Paediatrician" : "General Physician");
    return {
      agent: AGENT,
      text: `Since the ${topic} hasn't improved, it's a good idea to have it checked rather than wait longer.`,
      cards: [
        { id: cardId(), type: "care_level", level: "clinician", audience: vet ? "vet" : "human" },
        { id: cardId(), type: "doctor_recommendation", speciality, reason: `${/^[AEIOU]/.test(speciality) ? "An" : "A"} ${speciality} can examine ${vet ? ctx.profile.display_name : "you"} and work out why it isn't settling.`, timing: "soon", profileId: ctx.profile.id, status: "open" },
      ],
      lockText: true,
      state: base,
      response: baseResponse(ctx, { urgency: "MODERATE", summary: `Check-in: ${topic} not improving`, doctorReviewRecommended: true, doctorSpeciality: speciality }),
    };
  }
  if (outcome === "worse")
    return ask(ctx, { ...emptyState("symptom", ctx.profile.id), summaryTopic: topic }, {
      key: "followup_worse",
      text: "I'm sorry it's worse. What has changed?",
      style: "multi",
      options: [
        { label: "Much more pain", value: "pain" },
        { label: "High fever", value: "fever" },
        { label: "Difficulty breathing", value: "breathing" },
        { label: "Can't keep fluids down", value: "fluids" },
        { label: vet ? "Collapsed or very weak" : "Confused or very drowsy", value: "confusion" },
        { label: "Something else", value: "other" },
      ],
    });
  // New symptoms: start a fresh check for the same person.
  const st: GuidedState = { ...emptyState("symptom", ctx.profile.id), asked: ["who_for"], answers: { who_for: `profile:${ctx.profile.id}` } };
  return symptomStep(ctx, st);
}

async function followUpWorse(ctx: AgentContext, value: string): Promise<AgentResult> {
  const picked = value.split("|");
  const vet = ctx.profile.relationship === "pet";
  const labels: Record<string, string> = { pain: "Much more pain", fever: "High fever", breathing: "Difficulty breathing", fluids: "Can't keep fluids down", confusion: vet ? "Collapsed or very weak" : "New confusion or drowsiness", other: "Getting worse" };
  const reasons = picked.map((p) => labels[p] ?? "Getting worse");
  const emergency = picked.includes("breathing") || picked.includes("confusion");
  const state = { ...(ctx.state.guided ?? emptyState("symptom", ctx.profile.id)), done: true };
  return escalate(ctx, state, emergency ? "emergency" : "urgent", reasons, vet ? "vet" : "human");
}

// ------------------------------------------------------------------------------------------------- photos

type PhotoSubject = ImageFindings["subject"];

/** Shared photo of a symptom: quality first, objective description (with a vision model), then guided questions. */
async function photoStep(ctx: AgentContext, reportId: string): Promise<AgentResult> {
  const review = await reviewPhotoFile(ctx, reportId);
  const base: GuidedState = { ...emptyState("symptom", ctx.profile.id), relevantReports: [{ id: reportId, title: "Photo", date: null }] };
  if (review.quality === "unusable")
    return ask(ctx, base, {
      key: "photo_retake",
      text: `The photo is a little too ${review.qualityIssues.some((i) => /dark/i.test(i)) ? "dark" : "blurred"} to assess reliably. Please send another photo in natural light, closer and in focus.`,
      style: "upload",
      options: [
        { label: "Take Photo", value: "camera" },
        { label: "Upload Photo", value: "upload" },
      ],
    });
  const limited = review.quality === "limited" ? `The photo quality is limited (${review.qualityIssues.join(", ").toLowerCase()}), so I'll rely more on your answers. ` : "";
  const f = review.findings;
  if (!f) {
    return ask(
      ctx,
      base,
      {
        key: "photo_subject",
        text: "What does the photo show?",
        style: "chips",
        options: [
          { label: "Rash or skin spots", value: "skin" },
          { label: "Wound, cut or burn", value: "wound" },
          { label: "Swelling", value: "swelling" },
          { label: "Eye", value: "eye" },
          { label: "Throat or mouth", value: "throat" },
          { label: "Nails", value: "nail" },
          { label: "Scalp or hair", value: "scalp" },
          { label: "Stool or vomit", value: "stool" },
          { label: "My pet's skin", value: "pet" },
          { label: "My pet's ear or eye", value: "pet_ear" },
          { label: "Something else", value: "other" },
        ],
      },
      `${limited}I've saved the photo to ${you(ctx, "your", "{name}'s")} reports. Automatic photo description isn't switched on in this version, so I'll ask a few questions instead.`,
    );
  }
  const seen = `What I can see: ${f.visibleFindings.join("; ")}.`;
  const maybe = f.possibleCategories.length ? ` A photo alone isn't enough to tell the exact cause — it could be consistent with ${f.possibleCategories.join(", ")}.` : " A photo alone isn't enough to tell the exact cause.";
  if (f.nextStep === "emergency") return escalate(ctx, { ...base, done: true }, "emergency", f.visibleRedFlags.length ? f.visibleRedFlags : ["Warning signs visible in the photo"], ctx.profile.relationship === "pet" || f.subject === "pet" ? "vet" : "human");
  return symptomFromPhoto(ctx, base, f.subject, `${limited}${seen}${maybe}${f.visibleRedFlags.length ? ` Warning signs I noticed: ${f.visibleRedFlags.join("; ")}.` : ""} A few questions will help.`);
}

/** Continues into the matching guided questions for what the photo shows. */
async function symptomFromPhoto(ctx: AgentContext, base: GuidedState, subject: PhotoSubject, lead: string): Promise<AgentResult> {
  let state: GuidedState = { ...base, answers: { ...base.answers, photo_subject: subject }, asked: [...base.asked, "photo_subject"], pending: null };
  if (subject === "skin") state = { ...state, complaint: "skin" };
  else if (subject === "wound") state = { ...state, complaint: "skin", symptomType: "wound", answers: { ...state.answers, skin_type: "wound" } };
  else if (subject === "swelling") state = { ...state, complaint: "skin", symptomType: "swelling", answers: { ...state.answers, skin_type: "swelling" } };
  else if (subject === "eye") state = { ...state, complaint: "eye" };
  else if (subject === "throat") state = { ...state, complaint: "ent", answers: { ...state.answers, ent_part: "throat" } };
  else if (subject === "nail") state = { ...state, complaint: "other", symptomType: "nails", answers: { ...state.answers, other_describe: "nails" } };
  else if (subject === "scalp") state = { ...state, complaint: "hair" };
  else if (subject === "stool") state = { ...state, complaint: "stomach" };
  else if (subject === "pet" || subject === "pet_ear") {
    state = ctx.profile.relationship === "pet" ? state : { ...state, patient: { kind: "pet", label: "your pet", saved: false } };
    state = { ...state, symptomType: "skin", answers: { ...state.answers, pet_category: "skin", ...(subject === "pet_ear" ? { pet_photo: "ear" } : {}) } };
  }
  const r = await symptomStep(ctx, state);
  if (lead) r.text = `${lead} ${r.text}`;
  return r;
}

// ------------------------------------------------------------------------------------------------- test results

async function testStep(ctx: AgentContext, prevState: GuidedState, a: StructuredAnswer): Promise<GuidedOutcome> {
  const state: GuidedState = { ...prevState, answers: { ...prevState.answers, [a.key]: a.value }, pending: null };
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  if (a.key === "test_pick") state.test = a.value;
  const test = state.test;
  const uploadOptions = [
    { label: "Take Photo", value: "camera" },
    { label: "Upload Report", value: "upload" },
    { label: "Choose from Reports", value: "pick" },
  ];

  if (test === "other") {
    if (!state.answers.other_test) return ask(ctx, state, { key: "other_test", text: "Which test is it? You can type the name and value, or upload the report.", style: "upload", options: uploadOptions, allowText: true, textPlaceholder: "e.g. Vitamin D 18" });
    return { reroute: `Explain my ${state.answers.other_test} result` };
  }

  // ---- Blood sugar: value → timing → diabetes (only if unknown) → offer related HbA1c → result
  if (test === "blood_sugar") {
    if (!state.answers.sugar_value) return ask(ctx, state, { key: "sugar_value", text: "What's the reading?", style: "number", options: [], number: { label: "Blood sugar", unit: "mg/dL", min: 20, max: 600, placeholder: "e.g. 145" } });
    if (!state.answers.sugar_timing)
      return ask(ctx, state, {
        key: "sugar_timing",
        text: "When was it measured?",
        style: "chips",
        options: [
          { label: "Fasting", value: "fasting" },
          { label: "Before food", value: "before_meal" },
          { label: "1 hour after food", value: "after_60" },
          { label: "2 hours after food", value: "after_120" },
          { label: "Random", value: "random" },
        ],
      });
    const conditions = await patient.conditions();
    const meds = await patient.activeMedications();
    const known = conditions.some((c) => /diabet/i.test(c.name)) || meds.some((m) => /metformin|glimepiride|sitagliptin|insulin|gliflozin/i.test(`${m.name} ${m.generic_name ?? ""}`));
    if (!known && !state.answers.diabetes) return ask(ctx, state, { key: "diabetes", text: you(ctx, "Have you been diagnosed with diabetes?", "Has {name} been diagnosed with diabetes?"), style: "yesno", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }, { label: "Not sure", value: "unsure" }] });
    const hba1c = await patient.labHistory("HbA1c", 1);
    if (hba1c.length && !state.answers.use_related) {
      const when = hba1c[0]!.observed_at ? new Date(hba1c[0]!.observed_at).toLocaleDateString("en-GB", { month: "long" }) : "earlier";
      state.relevantReports = [{ id: hba1c[0]!.report_id, title: hba1c[0]!.title, date: hba1c[0]!.observed_at }];
      return ask(ctx, state, { key: "use_related", text: `I also found ${you(ctx, "your", "{name}'s")} HbA1c report from ${when}. Would you like me to consider that too?`, style: "yesno", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] });
    }
    const timing = state.answers.sugar_timing!;
    const sub: AgentContext = {
      ...ctx,
      message: "",
      concepts: [],
      state: {
        ...ctx.state,
        pending: {
          kind: "glucose",
          value: Number(state.answers.sugar_value),
          context: timing.startsWith("after_") ? "after_meal" : timing,
          minutesAfterMeal: timing === "after_60" ? 60 : timing === "after_120" ? 120 : null,
          askedDiabetes: true,
          secondaryValue: known || state.answers.diabetes === "yes" ? 1 : state.answers.diabetes === "no" ? 0 : null,
        },
      },
    };
    const r = await measurementAgent(sub);
    if (state.answers.use_related === "no") r.text = r.text.replace(/Latest HbA1c on record: [^ ]+( \(previously [^)]+\))?\.\s*/, "");
    r.state = { ...(r.state ?? ctx.state), guided: { ...state, done: true } };
    return r;
  }

  // ---- Blood pressure: both numbers → symptoms right now → result (triage-aware)
  if (test === "blood_pressure") {
    if (!state.answers.bp_value)
      return ask(ctx, state, { key: "bp_value", text: "What were the two numbers on the monitor?", style: "number", options: [], number: { label: "Systolic (top)", unit: "mmHg", min: 50, max: 300, placeholder: "e.g. 130", secondary: { label: "Diastolic (bottom)", placeholder: "e.g. 85", min: 25, max: 200 } } });
    if (!state.answers.bp_symptoms)
      return ask(ctx, state, {
        key: "bp_symptoms",
        text: "Are you having any of these right now?",
        style: "multi",
        options: [
          { label: "Severe headache", value: "severe headache" },
          { label: "Chest pain", value: "chest pain" },
          { label: "Shortness of breath", value: "shortness of breath" },
          { label: "Blurred vision", value: "blurred vision" },
          { label: "Weakness or numbness on one side", value: "weak on one side" },
          { label: "None of these", value: "none", exclusive: true },
        ],
      });
    const [sys, dia] = state.answers.bp_value.split("/").map(Number);
    const symptomsText = state.answers.bp_symptoms.split("|").filter((x) => x !== "none").join(", ");
    const concepts = symptomsText ? await getClinicalTerminology().extractConcepts(symptomsText) : [];
    const r = await measurementAgent({ ...ctx, message: `${sys}/${dia}`, concepts, state: { ...ctx.state, pending: { kind: "blood_pressure", value: sys, secondaryValue: dia } } });
    r.state = { ...(r.state ?? ctx.state), guided: { ...state, done: true } };
    return r;
  }

  if (test === "cholesterol") return lipidStep(ctx, state, uploadOptions);

  // ---- Lab values typed in (HbA1c, thyroid, haemoglobin) or uploaded
  if (test === "cbc" && !state.answers.cbc_how)
    return ask(ctx, state, { key: "cbc_how", text: "A blood count has several values. Upload the report and I'll go through each one — or enter just the haemoglobin.", style: "upload", options: [...uploadOptions, { label: "Enter haemoglobin only", value: "enter" }] });
  const valueKey = test === "cbc" ? "haemoglobin" : test ?? "";
  const def = valueKey ? VALUE_TESTS[valueKey] : undefined;
  if (!def) return startFlow(ctx, "test_result");
  const howKey = `${test}_how`;
  if (test !== "cbc" && !state.answers[howKey]) return ask(ctx, state, { key: howKey, text: `Would you like to enter your ${def.name} value, or share the report?`, style: "upload", options: [{ label: "Enter value", value: "enter" }, ...uploadOptions] });
  const valueAnswerKey = `${valueKey}_value`;
  if (!state.answers[valueAnswerKey]) return ask(ctx, state, { key: valueAnswerKey, text: `What's the ${def.name} value?`, style: "number", options: [], number: { label: def.name, unit: def.unit, min: def.min, max: def.max, step: def.step, placeholder: def.placeholder } });

  const value = Number(state.answers[valueAnswerKey]);
  const band = def.band(value, { sex: ctx.profile.sex });
  const history = await patient.labHistory(RELATED_LAB[valueKey] ?? def.name, 3);
  const prev = history.find((h) => Math.abs(h.value - value) > 1e-9) ?? null;
  const lines = [`${def.name} ${value}${def.unit === "%" ? "%" : ` ${def.unit}`} — ${band.label.toLowerCase()}.`, band.meaning];
  if (prev) lines.push(`${you(ctx, "Your", "{name}'s")} previous result was ${prev.value}${def.unit === "%" ? "%" : ` ${def.unit}`}${prev.observed_at ? ` (${formatDate(prev.observed_at)})` : ""}.`);
  lines.push("Lab ranges vary a little, so check the range printed on your report too.");
  const cards: ChatCard[] = [{ id: cardId(), type: "info", tone: band.tone === "ok" ? "success" : "warning", title: `${def.name}: ${band.label}`, body: band.meaning }];
  if (band.doctor) cards.push({ id: cardId(), type: "doctor_recommendation", speciality: band.doctor, reason: band.doctor === "General Physician" ? "A General Physician can review this result with your history and decide if anything is needed." : `${/^[AEIOU]/.test(band.doctor) ? "An" : "A"} ${band.doctor} commonly manages results like this.`, timing: "routine", profileId: ctx.profile.id, status: "open" });
  if (def.measurementType) cards.push({ id: cardId(), type: "record_proposal", kind: "measurement", profileId: ctx.profile.id, profileName: ctx.profile.display_name, label: `Save HbA1c ${value}% to ${you(ctx, "your", "{name}'s")} record?`, payload: { measurementType: "hba1c", value, unit: "%", source: "chat" }, status: "pending" });
  return {
    agent: AGENT,
    text: lines.join(" "),
    cards,
    lockText: true,
    state: { ...ctx.state, guided: { ...state, done: true }, lastIntent: "measurements" },
    response: baseResponse(ctx, { intent: "measurements", urgency: band.tone === "ok" ? "LOW" : "MODERATE", summary: `${def.name} ${value} ${def.unit}: ${band.label}`, doctorReviewRecommended: !!band.doctor, doctorSpeciality: band.doctor }),
  };
}

// ------------------------------------------------------------------------------------------------- cholesterol in context

/** NCEP ATP III bands (mg/dL). Values are always interpreted with overall heart risk, never alone. */
function lipidBand(kind: "ldl" | "hdl" | "tg" | "total", v: number, sex: string | null): { label: string; flag: "ok" | "borderline" | "high" | "low" } {
  if (kind === "ldl") return v < 100 ? { label: "optimal", flag: "ok" } : v < 130 ? { label: "near optimal", flag: "ok" } : v < 160 ? { label: "borderline high", flag: "borderline" } : v < 190 ? { label: "high", flag: "high" } : { label: "very high", flag: "high" };
  if (kind === "hdl") return v < (sex === "female" ? 50 : 40) ? { label: "low", flag: "low" } : v >= 60 ? { label: "good (protective)", flag: "ok" } : { label: "acceptable", flag: "ok" };
  if (kind === "tg") return v < 150 ? { label: "normal", flag: "ok" } : v < 200 ? { label: "borderline high", flag: "borderline" } : v < 500 ? { label: "high", flag: "high" } : { label: "very high", flag: "high" };
  return v < 200 ? { label: "desirable", flag: "ok" } : v < 240 ? { label: "borderline high", flag: "borderline" } : { label: "high", flag: "high" };
}

const LIPID_FIELDS = [
  { key: "ldl_value", kind: "ldl" as const, name: "LDL", placeholder: "e.g. 130" },
  { key: "hdl_value", kind: "hdl" as const, name: "HDL", placeholder: "e.g. 45" },
  { key: "tg_value", kind: "tg" as const, name: "Triglycerides", placeholder: "e.g. 150" },
  { key: "total_value", kind: "total" as const, name: "Total cholesterol", placeholder: "e.g. 200" },
];

async function lipidStep(ctx: AgentContext, state: GuidedState, uploadOptions: { label: string; value: string }[], lead?: string): Promise<GuidedOutcome> {
  const a = state.answers;
  if (!a.cholesterol_how) return ask(ctx, state, { key: "cholesterol_how", text: "Would you like to enter your cholesterol numbers, or share the report?", style: "upload", options: [{ label: "Enter values", value: "enter" }, ...uploadOptions] });
  if (!a.lipid_units) return ask(ctx, state, { key: "lipid_units", text: "Which units does your report use?", style: "chips", options: [{ label: "mg/dL", value: "mgdl" }, { label: "mmol/L", value: "mmol" }, { label: "Not sure", value: "unsure" }] });
  const mmol = a.lipid_units === "mmol";
  const unit = mmol ? "mmol/L" : "mg/dL";
  for (const f of LIPID_FIELDS) {
    if (a[f.key] == null)
      return ask(
        ctx,
        state,
        {
        key: f.key,
        text: f.kind === "ldl" ? "What's your LDL (the 'bad' cholesterol)?" : `And your ${f.name}?`,
        style: "number",
        options: [{ label: "I don't have this", value: "skip" }],
          number: { label: f.name, unit, min: mmol ? 0.1 : 5, max: mmol ? 30 : 2000, step: mmol ? 0.1 : 1, placeholder: mmol ? "" : f.placeholder },
        },
        lead,
      );
  }
  if (!a.lipid_risks)
    return ask(ctx, state, {
      key: "lipid_risks",
      text: "Numbers mean more alongside overall heart risk. Which of these apply?",
      style: "multi",
      options: [
        { label: "High blood pressure", value: "bp" },
        { label: "Diabetes", value: "diabetes" },
        { label: "Smoking", value: "smoking" },
        { label: "Kidney disease", value: "kidney" },
        { label: "Had a heart attack, stroke or artery disease", value: "cvd" },
        { label: "Parent or sibling with early heart disease", value: "family" },
        { label: "Already taking cholesterol medicine", value: "statin" },
        { label: "None of these", value: "none", exclusive: true },
      ],
    });

  // Convert mmol/L → mg/dL for the bands (cholesterol × 38.67, triglycerides × 88.57).
  const toMg = (kind: string, v: number) => (mmol ? (kind === "tg" ? v * 88.57 : v * 38.67) : v);
  const lines: string[] = [];
  const flagged: string[] = [];
  let veryHigh = false;
  for (const f of LIPID_FIELDS) {
    const raw = a[f.key];
    if (!raw || raw === "skip") continue;
    const v = Number(raw);
    const band = lipidBand(f.kind, toMg(f.kind, v), ctx.profile.sex);
    lines.push(`• ${f.name} ${v} ${unit} — ${band.label}`);
    if (band.flag !== "ok") flagged.push(f.name);
    if ((f.kind === "ldl" && toMg("ldl", v) >= 190) || (f.kind === "tg" && toMg("tg", v) >= 500)) veryHigh = true;
  }
  if (!lines.length) return { reroute: "What do cholesterol numbers mean?" };
  const risks = (a.lipid_risks ?? "").split("|").filter((x) => x && x !== "none");
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const conditions = (await patient.conditions()).map((c) => c.name);
  if (conditions.some((c) => /diabet/i.test(c)) && !risks.includes("diabetes")) risks.push("diabetes");
  if (conditions.some((c) => /hypertens|blood pressure/i.test(c)) && !risks.includes("bp")) risks.push("bp");
  const age = ctx.profile.age;
  const ageRisk = age != null && ((ctx.profile.sex === "female" && age >= 55) || (ctx.profile.sex !== "female" && age >= 45));
  const heartDisease = risks.includes("cvd");
  const riskCount = risks.filter((r) => r !== "statin").length + (ageRisk ? 1 : 0);
  const prev = await patient.labHistory("LDL cholesterol", 2);

  const intro = flagged.length ? `${flagged.join(" and ")} ${flagged.length === 1 ? "is" : "are"} outside the usual target.` : "These numbers are within the usual targets.";
  const context = heartDisease
    ? "Because of previous heart or artery disease, your doctor will usually aim for lower LDL targets."
    : riskCount >= 2
      ? `With ${riskCount} heart-risk factors${ageRisk ? " (including age)" : ""}, your doctor will look at these numbers together with your overall heart risk.`
      : "Your doctor will look at these numbers together with your overall heart risk, not just one result.";
  const prevLine = prev.length && a.ldl_value && a.ldl_value !== "skip" ? ` Your previous LDL on record was ${prev[0]!.value} ${prev[0]!.unit}.` : "";
  const speciality = heartDisease || veryHigh ? "Cardiologist" : flagged.length || riskCount >= 2 ? "General Physician" : null;
  const level = veryHigh ? "clinician" : speciality ? "clinician" : "monitor";
  const cards: ChatCard[] = [
    { id: cardId(), type: "care_level", level, audience: "human" },
    { id: cardId(), type: "info", tone: flagged.length ? "warning" : "success", title: "Your cholesterol numbers", body: lines.join("\n") },
    { id: cardId(), type: "info", tone: "info", title: "What you can do", body: ["• Eat more vegetables, pulses, oats and whole grains; less fried food and sweets", "• Aim for 30 minutes of brisk activity most days", "• If you smoke, stopping helps your heart the most", a.lipid_risks?.includes("statin") ? "• Keep taking your cholesterol medicine as prescribed" : "• Don't start or stop cholesterol medicine without your doctor"].join("\n") },
  ];
  if (speciality)
    cards.push({ id: cardId(), type: "doctor_recommendation", speciality, reason: speciality === "Cardiologist" ? "A Cardiologist commonly manages very high cholesterol or cholesterol after heart disease." : "A General Physician can calculate your overall heart risk and decide whether treatment is needed.", timing: veryHigh ? "soon" : "routine", profileId: ctx.profile.id, status: "open" });
  return {
    agent: AGENT,
    text: `${intro} ${context}${prevLine}${a.lipid_units === "unsure" ? " I've assumed mg/dL — check the units printed on your report." : ""}`,
    cards,
    lockText: true,
    state: { ...ctx.state, guided: { ...state, done: true }, lastIntent: "measurements" },
    response: baseResponse(ctx, { intent: "measurements", urgency: flagged.length ? "MODERATE" : "LOW", summary: `Lipids: ${lines.join("; ")}`, doctorReviewRecommended: !!speciality, doctorSpeciality: speciality }),
  };
}

/** "My LDL is 172" → the cholesterol flow, with the typed values already filled in. */
export async function startLipidFromText(ctx: AgentContext, values: { ldl?: number; hdl?: number; tg?: number; total?: number; mmol: boolean }): Promise<GuidedOutcome> {
  const answers: Record<string, string> = { test_pick: "cholesterol", cholesterol_how: "enter", lipid_units: values.mmol ? "mmol" : "mgdl" };
  if (values.ldl != null) answers.ldl_value = String(values.ldl);
  if (values.hdl != null) answers.hdl_value = String(values.hdl);
  if (values.tg != null) answers.tg_value = String(values.tg);
  if (values.total != null) answers.total_value = String(values.total);
  // Values not typed are optional: offer them once, then move on to risk factors.
  const state: GuidedState = { ...emptyState("test_result", ctx.profile.id), test: "cholesterol", answers, asked: Object.keys(answers) };
  const typed = [values.ldl != null ? `LDL ${values.ldl}` : null, values.hdl != null ? `HDL ${values.hdl}` : null, values.tg != null ? `triglycerides ${values.tg}` : null, values.total != null ? `total cholesterol ${values.total}` : null].filter(Boolean).join(", ");
  return lipidStep(
    ctx,
    state,
    [
      { label: "Take Photo", value: "camera" },
      { label: "Upload Report", value: "upload" },
      { label: "Choose from Reports", value: "pick" },
    ],
    `${typed.charAt(0).toUpperCase()}${typed.slice(1)} is worth looking at alongside your overall heart risk, not on its own. A few quick questions first.`,
  );
}

// ------------------------------------------------------------------------------------------------- general questions

const SUGGESTIONS: Record<string, string[]> = {
  diet: ["What should I eat with diabetes?", "How can I lose weight healthily?", "Diet tips for high blood pressure", "Foods for more energy"],
  exercise: ["Can I exercise today?", "Exercise ideas for diabetes", "How much should I walk each day?", "Safe exercise with knee pain"],
  sleep: ["I can't fall asleep", "I keep waking up at night", "How much sleep do I need?"],
  general: ["How can I boost my immunity?", "Which health check-ups do I need?", "How much water should I drink?"],
  medicine: ["Can I take paracetamol?", "What are the side effects of my medicine?", "I missed a dose — what should I do?"],
  other: [],
};

async function questionStep(ctx: AgentContext, state: GuidedState, a: StructuredAnswer): Promise<GuidedOutcome> {
  if (a.key !== "question_topic") return { reroute: a.label ?? a.value };
  const s = { ...state, topic: a.value, answers: { ...state.answers, question_topic: a.value } };
  const opts = SUGGESTIONS[a.value] ?? [];
  return ask(ctx, s, {
    key: "question_suggest",
    text: opts.length ? "Pick a question, or type your own." : "What would you like to ask?",
    style: "chips",
    options: opts.map((o) => ({ label: o, value: o })),
    allowText: true,
    textPlaceholder: "Type your question",
  });
}

// ------------------------------------------------------------------------------------------------- reports

const DOCTOR_FOR_TEST: [RegExp, string][] = [
  [/hba1c|glucose/i, "Diabetologist"],
  [/tsh|thyroid/i, "Endocrinologist"],
  [/creatinine|egfr|urea/i, "Nephrologist"],
  [/alt|ast|bilirubin|sgpt|sgot/i, "Gastroenterologist"],
];

async function reviewReport(ctx: AgentContext, reportId: string): Promise<AgentResult> {
  const { report, results } = await getReport(ctx.actor, reportId);
  const db = await getDb();
  const labs = results.filter((r) => r.field_type === "lab_value");
  const prevMap = new Map<string, number>();
  for (const res of labs) {
    if (!res.canonical_name) continue;
    const prev = (await db.query<{ value: number }>("select value from report_results where profile_id = $1 and canonical_name = $2 and report_id <> $3 and status = 'confirmed' and value is not null order by observed_at desc nulls last limit 1", [report.profile_id, res.canonical_name, report.id])).rows[0];
    if (prev) prevMap.set(res.canonical_name, prev.value);
  }
  const flagged = labs.filter((r) => r.flag && /^(h|l|high|low|abnormal|critical)/i.test(r.flag));
  const unreadable = labs.filter((r) => r.status === "unreadable" || (r.value == null && !r.value_text));
  const owner = report.profile_id === ctx.profile.id ? you(ctx, "your", "{name}'s") : `${report.profile_name}'s`;
  const type = report.document_type.replace(/_/g, " ");
  const lines: string[] = [];
  lines.push(`I've read ${owner} ${type === "other" ? "report" : type}${report.report_date ? ` from ${formatDate(report.report_date)}` : ""}${report.lab_name ? ` (${report.lab_name})` : ""}.`);
  if (report.profile_id !== ctx.profile.id) lines.push(`It's saved under ${report.profile_name}'s profile.`);
  if (labs.length) lines.push(flagged.length ? `${flagged.length} of ${labs.length} values ${flagged.length === 1 ? "is" : "are"} outside the lab's range: ${flagged.slice(0, 4).map((f) => f.canonical_name ?? f.test_name).join(", ")}.` : `All ${labs.length} values I could read are within the lab's ranges.`);
  else if (report.summary) lines.push(report.summary);
  if (unreadable.length) lines.push(`I couldn't read ${unreadable.length} value${unreadable.length === 1 ? "" : "s"} clearly, so I haven't guessed ${unreadable.length === 1 ? "it" : "them"} — you can check ${unreadable.length === 1 ? "it" : "them"} on the report.`);
  if (report.status === "processing") lines.push("It's still being processed — give it a moment and ask me again.");

  const cards: ChatCard[] = [];
  if (labs.length)
    cards.push({
      id: cardId(),
      type: "report_summary",
      reportId: report.id,
      title: report.title,
      status: report.status,
      date: report.report_date,
      highlights: labs.map((x) => ({ name: x.canonical_name ?? x.test_name, value: x.value, valueText: x.value_text, unit: x.unit, flag: x.flag, status: x.status, previous: x.canonical_name ? prevMap.get(x.canonical_name) ?? null : null })),
    });
  if (flagged.length) {
    const names = flagged.map((f) => f.canonical_name ?? f.test_name).join(" ");
    const doctor = DOCTOR_FOR_TEST.find(([re]) => re.test(names))?.[1] ?? "General Physician";
    cards.push({ id: cardId(), type: "doctor_recommendation", speciality: doctor, reason: doctor === "General Physician" ? "A General Physician can go through the values outside range and decide if anything is needed." : `${/^[AEIOU]/.test(doctor) ? "An" : "A"} ${doctor} commonly looks after results like ${flagged[0]!.canonical_name ?? flagged[0]!.test_name}.`, timing: "routine", profileId: report.profile_id, status: "open" });
  }
  const followups = [
    ...(flagged.length ? [{ label: "What do these results mean?", value: `What do the out-of-range values in my ${report.title} mean?` }] : [{ label: "Explain the results", value: `Explain my ${report.title}` }]),
    ...(prevMap.size ? [{ label: "Compare with earlier results", value: `Compare ${[...prevMap.keys()][0]} with earlier reports` }] : []),
    { label: "Open the report", value: `open:${report.id}` },
  ];
  cards.push(questionCard({ key: "report_followup", text: "", style: "chips", options: followups }));
  return {
    agent: AGENT,
    text: lines.join(" "),
    cards,
    lockText: true,
    state: { ...ctx.state, guided: { ...emptyState("report", ctx.profile.id), relevantReports: [{ id: report.id, title: report.title, date: report.report_date }], pending: "report_followup", asked: ["report_source", "report_followup"] }, lastIntent: "reports" },
    response: baseResponse(ctx, { intent: "reports", urgency: flagged.length ? "MODERATE" : "LOW", summary: `Report review: ${report.title}`, doctorReviewRecommended: flagged.length > 0 }),
  };
}

// ------------------------------------------------------------------------------------------------- doctor discovery

/** Directory search keywords for each doctor category. */
const SEARCH_TERM: Record<string, string> = {
  "General Physician": "General",
  Paediatrician: "Paediatric",
  Gastroenterologist: "Gastro",
  Cardiologist: "Cardio",
  "Orthopaedic Doctor": "Ortho",
  Veterinarian: "Veterin",
  Neurologist: "Neuro",
  Dermatologist: "Dermat",
  "ENT Specialist": "ENT",
  Gynaecologist: "Gynae",
  Pulmonologist: "Pulmon",
  Endocrinologist: "Endocrin",
  Diabetologist: "Diabet",
  Urologist: "Urolog",
  Ophthalmologist: "Ophthal",
  Nephrologist: "Nephro",
};

async function findDoctor(ctx: AgentContext, speciality: string): Promise<GuidedOutcome> {
  const base = ctx.state.guided ?? emptyState("find_doctor", ctx.profile.id);
  const state: GuidedState = { ...base, flow: "find_doctor", speciality: speciality || "General Physician", pending: null };
  const city = await getSavedCity(ctx.actor.id);
  if (city) return runSearch(ctx, state, { city });
  return askCity(ctx, state);
}

function askCity(ctx: AgentContext, state: GuidedState, lead?: string): AgentResult {
  return ask(ctx, state, { key: "city", text: "Which city are you in?", style: "location", options: [{ label: "Detect my location", value: "detect" }], allowText: true, textPlaceholder: "Enter your city" }, lead);
}

async function searchDoctors(ctx: AgentContext, value: string): Promise<AgentResult> {
  const state: GuidedState = { ...(ctx.state.guided ?? emptyState("find_doctor", ctx.profile.id)), flow: "find_doctor", pending: null };
  const geo = value.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (geo) {
    const lat = Number(geo[1]);
    const lon = Number(geo[2]);
    const db = await getDb();
    await db.query(
      `insert into user_preferences(user_id, location_permission, latitude, longitude, location_label) values ($1,'granted',$2,$3,'Current location')
       on conflict (user_id) do update set location_permission = 'granted', latitude = excluded.latitude, longitude = excluded.longitude, location_label = excluded.location_label, updated_at = now()`,
      [ctx.actor.id, Math.round(lat * 100) / 100, Math.round(lon * 100) / 100],
    );
    return runSearch(ctx, state, { near: { lat, lon } });
  }
  const city = value.trim().replace(/[^\p{L}\s.'-]/gu, "").slice(0, 60);
  if (city.length < 2) return askCity(ctx, state, "I didn't catch that.");
  await saveCity(ctx.actor.id, city);
  return runSearch(ctx, state, { city });
}

async function runSearch(ctx: AgentContext, state: GuidedState, where: { city?: string; near?: { lat: number; lon: number } }): Promise<AgentResult> {
  const speciality = state.speciality ?? "General Physician";
  const search = getProviderSearch();
  const term = SEARCH_TERM[speciality] ?? speciality.split(" ")[0];
  const vet = speciality === "Veterinarian";
  const params = { speciality: term, kind: vet ? undefined : "doctor", query: where.city, near: where.near, maxDistanceKm: where.near ? 25 : undefined };
  let rows = await search.search(params).catch(() => []);
  let fellBack = false;
  // Never offer a human doctor in place of a vet.
  if (!rows.length && speciality !== "General Physician" && !vet) {
    rows = await search.search({ ...params, speciality: "General" }).catch(() => []);
    fellBack = rows.length > 0;
  }
  const label = where.city ?? "your area";
  const mapsQuery = `${speciality} near ${where.city ?? "me"}`;
  const cards: ChatCard[] = [];
  const top = rows.slice(0, 5);
  if (top.length)
    cards.push({
      id: cardId(),
      type: "doctor_results",
      speciality,
      locationLabel: label,
      isDemo: search.isMock,
      mapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`,
      results: top.map((p) => ({ id: p.id, name: p.name, speciality: p.speciality, clinic: p.clinic, address: p.address, distanceKm: p.distance_km, phone: p.phone, availability: p.availability, consultationTypes: p.consultation_types, source: p.source })),
    });
  cards.push(questionCard({ key: "change_city", text: "", style: "chips", options: [{ label: where.city ? `Not in ${where.city}? Change city` : "Enter a city instead", value: speciality }] }));
  const text = top.length
    ? `${fellBack ? `I couldn't find a ${speciality} in ${label} in this directory, so here are General Physicians who can help first.` : `Here are ${speciality}s in ${label}.`}${search.isMock ? " These are demo listings — not real doctors." : ""} Check availability with the clinic before you go.`
    : `I couldn't find a ${speciality} in ${label} in this directory. You can search on Google Maps instead, or call your regular doctor.`;
  if (!top.length) cards.unshift({ id: cardId(), type: "actions", actions: [{ label: `Search Maps for ${speciality}s`, kind: "link", href: `https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`, variant: "primary" }, { label: "Call My Doctor", kind: "call_my_doctor" }] });
  return {
    agent: AGENT,
    text,
    cards,
    lockText: true,
    state: { ...ctx.state, guided: { ...state, pending: "change_city", done: true } },
    response: baseResponse(ctx, { summary: `Doctor search: ${speciality} in ${label}` }),
  };
}

// ------------------------------------------------------------------------------------------------- titles

/** Useful, short chat titles from structured state: "Left-side chest pain", "Mom's cough", "CBC report review". */
export function titleFromState(state: GuidedState | null | undefined, profile: { display_name: string; relationship: string }, reportTitle?: string): string | null {
  if (!state) return null;
  let t: string | null = null;
  const animalOrBaby = state.patient?.kind === "pet" || state.patient?.kind === "baby" || profile.relationship === "pet" || state.answers.baby_category != null;
  if (state.flow === "symptom" && animalOrBaby && state.symptomType) {
    t = CATEGORY_PHRASE[state.symptomType] ?? "health concern";
    if (state.patient && !state.patient.saved) return `${state.patient.kind === "pet" ? (state.patient.species ? `${state.patient.species.charAt(0).toUpperCase()}${state.patient.species.slice(1)}` : "Pet") : "Baby"}: ${t}`.slice(0, 60);
  } else if (state.flow === "symptom" && state.complaint) t = state.complaint === "other" && !state.symptomType ? null : complaintPhrase(state);
  else if (state.flow === "test_result" && state.test) {
    const timing = state.answers.sugar_timing;
    t =
      state.test === "blood_sugar"
        ? timing === "fasting"
          ? "Fasting blood sugar"
          : timing?.startsWith("after")
            ? "Blood sugar after food"
            : "Blood sugar reading"
        : ({ blood_pressure: "Blood pressure reading", hba1c: "HbA1c result", cholesterol: "Cholesterol result", thyroid: "Thyroid result", cbc: "Blood count (CBC)", other: "Test result" } as Record<string, string>)[state.test] ?? null;
  } else if (state.flow === "report" && (reportTitle || state.relevantReports[0])) t = `${reportTitle ?? state.relevantReports[0]!.title} review`;
  else if (state.flow === "question" && state.topic) t = `${({ diet: "Diet", exercise: "Exercise", sleep: "Sleep", general: "General health", medicine: "Medicine", other: "Health" } as Record<string, string>)[state.topic] ?? "Health"} question`;
  else if (state.flow === "symptom" && !state.complaint && !t) return null;
  if (!t) return null;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (state.flow === "symptom" && state.complaint === "pain" && state.side) t = t.replace(/^(Left|Right)-side/, (m) => m);
  if (profile.relationship !== "self") t = `${profile.display_name}'s ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  return t.slice(0, 60);
}

export const CTA_LABELS = ["Analyse a Report", "Check a Symptom", "Understand a Test Result", "Ask a Health Question"];
export { COMPLAINT_LABEL };
