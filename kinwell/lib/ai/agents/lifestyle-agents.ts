import "server-only";
import { LIFESTYLE_GUIDANCE } from "@/lib/clinical/reference";
import { getWeatherProvider, weatherHealthTips } from "@/lib/integrations/weather";
import { getDb } from "@/lib/database/client";
import { PatientContextService } from "../services/patient-context";
import { excerpt, retrieveDoctorKnowledge } from "../services/retrieval";
import { baseResponse, cardId, type AgentContext, type AgentResult } from "./context";
import type { ChatCard } from "../types";

async function doctorGuidanceCard(ctx: AgentContext, patient: PatientContextService, topics: string[], query: string, category: string) {
  const instructions = (await patient.doctorInstructions(topics)).filter((i) => ["activity_restriction", "diet_restriction", "general", "monitoring", "treatment_protocol"].includes(i.instruction_type));
  const knowledge = await retrieveDoctorKnowledge(ctx.doctor?.id ?? null, query, ctx.sources, { k: 2, category });
  const items = [
    ...instructions.map((i) => ({ kind: "instruction" as const, title: `Instruction (${i.instruction_type.replace(/_/g, " ")})`, text: i.instruction, version: i.version })),
    ...knowledge.map((k) => ({ kind: "knowledge" as const, title: k.title, text: excerpt(k, query), documentId: k.document_id, version: k.version })),
  ];
  return items.length ? ({ id: cardId(), type: "doctor_guidance", doctorName: ctx.doctor?.name ?? "Your doctor", items } as ChatCard) : null;
}

async function weatherFor(ctx: AgentContext) {
  const db = await getDb();
  const pref = (await db.query<{ location_permission: string; latitude: number | null; longitude: number | null; location_label: string | null }>("select location_permission, latitude, longitude, location_label from user_preferences where user_id = $1", [ctx.actor.id])).rows[0];
  if (pref?.location_permission !== "granted" || pref.latitude == null || pref.longitude == null) return null;
  ctx.sources.section("weather");
  return getWeatherProvider().current(pref.latitude, pref.longitude, pref.location_label ?? undefined).catch(() => null);
}

export async function exerciseAgent(ctx: AgentContext): Promise<AgentResult> {
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const [conditions, bp, glucose, weather, checkins] = await Promise.all([
    patient.conditions(),
    patient.measurements("blood_pressure", { days: 3, limit: 1 }),
    patient.measurements("blood_glucose", { days: 1, limit: 1 }),
    weatherFor(ctx),
    patient.recentCheckIns(1),
  ]);
  const lines: string[] = [];
  const g = LIFESTYLE_GUIDANCE.exercise;
  const unwell = checkins[0]?.mood === "unwell" || ctx.concepts.some((c) => !c.negated && ["fever", "chest_pain", "dizziness", "shortness_of_breath"].includes(c.code));
  if (unwell) lines.push("Since you're feeling unwell, rest is the better choice today. Gentle stretching is fine if you feel up to it; resume normal exercise when symptoms settle.");
  else if (bp[0] && (bp[0].value >= 160 || (bp[0].secondary_value ?? 0) >= 100)) lines.push(`Your most recent blood pressure was ${bp[0].value}/${bp[0].secondary_value}. Light activity like an easy walk is usually better than intense exercise until it's rechecked — and stop if you feel unwell.`);
  else if (glucose[0] && glucose[0].value < 80) lines.push(`Today's last sugar reading was ${glucose[0].value} mg/dL. Have a snack before exercising and carry something sugary.`);
  else lines.push("Yes — based on what's on record, a moderate session sounds reasonable today. A brisk 30-minute walk is a great default.");
  if (conditions.some((c) => /diabet/i.test(c.name))) lines.push("With diabetes, check your sugar before and after longer sessions.");
  const cards: ChatCard[] = [];
  const guidance = await doctorGuidanceCard(ctx, patient, ["exercise", "activity"], "exercise activity walking safe", "Exercise");
  if (guidance) {
    cards.push(guidance);
    lines.push("Your doctor's activity guidance is below.");
  }
  if (weather) {
    const tips = weatherHealthTips(weather, { hasRespiratoryCondition: conditions.some((c) => /asthma|copd/i.test(c.name)) });
    if (tips.length) cards.push({ id: cardId(), type: "info", tone: "info", title: `Weather · ${weather.temperatureC}°C${weather.isMock ? " (demo)" : ""}`, body: tips.map((x) => `• ${x.title}: ${x.body}`).join("\n") });
  }
  cards.push({ id: cardId(), type: "info", tone: "info", title: "Good habits", body: g.tips.map((x) => `• ${x}`).join("\n") + `\n\n${g.seekHelp}` });
  return { agent: "ExerciseAgent", text: lines.join(" "), cards, state: { ...ctx.state, lastIntent: "exercise" }, response: baseResponse(ctx, { intent: "exercise", recommendations: lines, selfCare: g.tips }) };
}

export async function nutritionAgent(ctx: AgentContext): Promise<AgentResult> {
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const conditions = await patient.conditions();
  const allergies = await patient.allergies();
  const g = LIFESTYLE_GUIDANCE.nutrition;
  const lines: string[] = [];
  if (conditions.some((c) => /diabet/i.test(c.name))) lines.push("For steadier blood sugar, pair carbs with protein or fibre, keep portions of rice/roti moderate, and choose whole fruit over juice.");
  if (conditions.some((c) => /hypertension|blood pressure/i.test(c.name))) lines.push("For blood pressure, go easy on salt, pickles, papad and packaged snacks.");
  if (!lines.length) lines.push("A balanced plate is a great starting point: half vegetables, a quarter protein, a quarter whole grains.");
  if (allergies.length) lines.push(`I've kept the recorded allergies in mind (${allergies.map((a) => a.substance).join(", ")}).`);
  const cards: ChatCard[] = [];
  const guidance = await doctorGuidanceCard(ctx, patient, ["diet", "nutrition"], `${ctx.message} diet nutrition food`, "Nutrition");
  if (guidance) {
    cards.push(guidance);
    lines.push("Your doctor's diet guidance is below — follow it first.");
  }
  cards.push({ id: cardId(), type: "info", tone: "info", title: "Everyday nutrition", body: g.tips.map((x) => `• ${x}`).join("\n") + `\n\n${g.seekHelp}` });
  return { agent: "NutritionAgent", text: lines.join(" "), cards, state: { ...ctx.state, lastIntent: "nutrition" }, response: baseResponse(ctx, { intent: "nutrition", recommendations: lines }) };
}

export async function sleepAgent(ctx: AgentContext): Promise<AgentResult> {
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const g = LIFESTYLE_GUIDANCE.sleep;
  const sleep = await patient.measurements("sleep_duration", { days: 14, limit: 14 });
  const answered = ctx.state.lastIntent === "sleep";
  if (!answered && !/fall(ing)? asleep|waking|wake up|early/i.test(ctx.message)) {
    const q = g.questions[0]!;
    return {
      agent: "SleepAgent",
      text: `That's frustrating — poor sleep affects everything. ${q.text}`,
      cards: [{ id: cardId(), type: "quick_replies", options: q.quickReplies!.map((o) => ({ label: o, value: o })) }],
      state: { ...ctx.state, lastIntent: "sleep" },
      response: baseResponse(ctx, { intent: "sleep", clarifyingQuestions: [q.text] }),
    };
  }
  const lines: string[] = [];
  if (sleep.length) {
    const avg = Math.round((sleep.reduce((s, x) => s + x.value, 0) / sleep.length) * 10) / 10;
    lines.push(`Over the last two weeks, logged sleep averaged ${avg} hours a night.`);
  }
  if (/falling asleep|fall asleep/i.test(ctx.message)) lines.push("For trouble falling asleep, a consistent wind-down routine and keeping screens out of bed help most.");
  else if (/waking at night|wake up at night/i.test(ctx.message)) lines.push("Night waking is often linked to caffeine, alcohol, a warm room, or needing the toilet — limiting fluids in the last hour before bed can help.");
  else if (/early/i.test(ctx.message)) lines.push("Waking too early can be linked to stress or low mood; daylight in the morning and a regular schedule can help.");
  const cards: ChatCard[] = [{ id: cardId(), type: "info", tone: "info", title: "Sleep habits that help", body: g.tips.map((x) => `• ${x}`).join("\n") }];
  const guidance = await doctorGuidanceCard(ctx, patient, ["sleep"], "sleep insomnia advice", "Sleep");
  if (guidance) cards.unshift(guidance);
  lines.push(g.seekHelp);
  return { agent: "SleepAgent", text: lines.join(" "), cards, state: { ...ctx.state, lastIntent: "sleep_done" }, response: baseResponse(ctx, { intent: "sleep", selfCare: g.tips }) };
}

export async function wellbeingAgent(ctx: AgentContext): Promise<AgentResult> {
  const g = LIFESTYLE_GUIDANCE.stress;
  const text = `Thank you for sharing that. Feeling stressed is really common, and it's okay to take a moment for yourself. ${g.tips[0]}. Would it help to talk through what's on your mind, or would some practical tips be more useful right now?`;
  return {
    agent: "LifestyleAgent",
    text,
    cards: [
      { id: cardId(), type: "quick_replies", options: [{ label: "Talk it through", value: "I'd like to talk it through" }, { label: "Practical tips", value: "Give me practical tips for stress" }] },
      { id: cardId(), type: "info", tone: "info", title: "Small things that help", body: g.tips.map((x) => `• ${x}`).join("\n") + `\n\n${g.seekHelp}` },
    ],
    state: { ...ctx.state, lastIntent: "mental_wellbeing" },
    response: baseResponse(ctx, { intent: "mental_wellbeing", selfCare: g.tips }),
  };
}

/** Daily Health Coach: check-ins, greetings and gentle, non-medicalising follow-ups. */
export async function coachAgent(ctx: AgentContext): Promise<AgentResult> {
  const t = ctx.message.toLowerCase().replace(/[.!]/g, "").trim();
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const mood = /great|good/.test(t) ? "great" : /ok|okay|fine|meh/.test(t) ? "okay" : /tired/.test(t) ? "tired" : /stress/.test(t) ? "stressed" : /unwell|not great|sick/.test(t) ? "unwell" : null;
  if (mood) {
    const db = await getDb();
    await db.query("insert into check_ins(profile_id, user_id, mood) values ($1,$2,$3)", [ctx.profile.id, ctx.actor.id, mood]);
    ctx.sources.section("check_in_saved");
    const followUps: Record<string, { text: string; replies?: string[] }> = {
      great: { text: "Love to hear it! Anything you'd like to plan today — a walk, meals, or a reading to log?", replies: ["Plan exercise", "Add blood sugar", "Nothing for now"] },
      okay: { text: "Thanks for checking in. Is there anything small that would make today a bit better?", replies: ["Sleep tips", "Plan exercise", "I'm fine"] },
      tired: { text: "Was your sleep shorter than usual, or are you feeling weak even after sleeping normally?", replies: ["Short sleep", "Slept normally"] },
      stressed: { text: "That sounds hard. Would a two-minute breathing exercise or some practical tips help?", replies: ["Breathing exercise", "Practical tips"] },
      unwell: { text: "I'm sorry to hear that. What's bothering you most right now?", replies: ["Fever", "Headache", "Cough", "Stomach upset"] },
    };
    const f = followUps[mood]!;
    return {
      agent: "DailyHealthCoach",
      text: f.text,
      cards: f.replies ? [{ id: cardId(), type: "quick_replies", options: f.replies.map((r) => ({ label: r, value: r === "Short sleep" ? "I slept less than usual" : r === "Slept normally" ? "I'm tired even after sleeping normally" : r })) }] : [],
      state: { ...ctx.state, lastIntent: "check_in" },
      response: baseResponse(ctx, { intent: "check_in", summary: `Check-in: ${mood}`, recordUpdates: [{ kind: "check_in", description: mood }] }),
    };
  }
  if (/slept less|short sleep/.test(t)) {
    return {
      agent: "DailyHealthCoach",
      text: "That makes sense then — a short night catches up with everyone. Try a 20-minute daylight walk, keep caffeine before 2 pm, and aim for an earlier wind-down tonight. Want some sleep tips?",
      cards: [{ id: cardId(), type: "quick_replies", options: [{ label: "Sleep tips", value: "I haven't been sleeping well" }, { label: "I'm okay", value: "Thanks" }] }],
      response: baseResponse(ctx, { intent: "check_in" }),
    };
  }
  if (/tired even after|weak even after/.test(t)) {
    const conditions = await patient.conditions();
    return {
      agent: "DailyHealthCoach",
      text: `Feeling tired despite normal sleep is worth keeping an eye on. Has it been going on for more than a couple of weeks, or is there anything else like breathlessness, low mood or weight change?${conditions.some((c) => /diabet|thyroid/i.test(c.name)) ? " Given the conditions on record, a check of recent blood tests with your doctor could be useful." : ""}`,
      cards: [{ id: cardId(), type: "quick_replies", options: [{ label: "Just a few days", value: "Just a few days" }, { label: "Weeks", value: "I've been tired for weeks" }] }],
      response: baseResponse(ctx, { intent: "check_in" }),
    };
  }
  const name = ctx.actor.fullName.split(" ")[0];
  return {
    agent: "DailyHealthCoach",
    text: /thank/.test(t) ? "You're welcome. I'm here whenever you need me." : `Hi ${name}! How are you feeling today?`,
    cards: /thank/.test(t) ? [] : [{ id: cardId(), type: "quick_replies", options: ["Great", "Okay", "Tired", "Stressed", "Unwell"].map((x) => ({ label: x, value: x })) }],
    response: baseResponse(ctx, { intent: "smalltalk" }),
  };
}
