import type { ConceptMatch } from "@/lib/integrations/terminology/clinical";
import type { ConversationState } from "@/lib/services/conversations";
import { LOCAL_DRUGS } from "@/lib/integrations/terminology/medication";
import { similarity } from "@/lib/utils/text";
import type { Intent, RouterOutput } from "../types";

/**
 * Router Agent (rule-based baseline). When an LLM is configured the orchestrator may ask it for a structured
 * routing decision, validated with Zod; this function is the always-available fallback and is unit-tested.
 */
export function routeMessage(message: string, concepts: ConceptMatch[], state: ConversationState): RouterOutput {
  const t = message.toLowerCase().trim();
  const present = new Set(concepts.filter((c) => !c.negated).map((c) => c.code));
  const scores = new Map<Intent, number>();
  const add = (i: Intent, s: number) => scores.set(i, (scores.get(i) ?? 0) + s);

  if (/^(great|okay|ok|tired|stressed|unwell|good|fine|not great|meh)[.!]*$/.test(t)) add("check_in", 5);
  if (/^(hi|hello|hey|thanks|thank you|good (morning|evening|afternoon))[.!]*$/.test(t)) add("smalltalk", 5);

  // Continuing a slot-filling flow (e.g. we just asked "fasting or after a meal?")
  if (state.pending) add("measurements", 3);
  if (state.symptomFlow && !/\b(sugar|glucose|bp|blood pressure|medicine|report)\b/.test(t)) add("symptoms", 2.5);

  const hasNumber = /\d/.test(t);
  if ((present.has("blood_glucose") || present.has("elevated_blood_glucose") || present.has("low_blood_glucose")) && !present.has("hba1c")) add("measurements", hasNumber ? 4 : 2.5);
  if (present.has("blood_pressure") || /\b\d{2,3}\s*\/\s*\d{2,3}\b/.test(t)) add("measurements", hasNumber ? 4 : 2);
  if (/\b(trend|chart|graph|history of my|over time)\b/.test(t)) {
    if (present.has("hba1c") || present.has("cholesterol")) add("reports", 3);
    else add("measurements", 2);
  }

  if (/\b(report|lab|test result|blood test|scan|x-?ray|ultrasound|analy[sz]e|cbc|lipid|hba1c|a1c|thyroid test)\b/.test(t)) add("reports", 3);
  if (present.has("cholesterol") || present.has("hba1c")) add("reports", 1.5);

  if (/\b(medicine|medication|tablet|pill|capsule|dose|dosage|drug|syrup|prescri|side effect|can i take|should i take|when should i take|interact|conflict)\b/.test(t)) add("medicine", 3.5);
  if (/\b(can|should|could) (i|she|he|they|we|mom|dad|my \w+) (take|have|give)\b/.test(t)) add("medicine", 2);
  const words = t.match(/[a-z]{4,}/g) ?? [];
  const drugMentioned = words.some((w) => LOCAL_DRUGS.some((d) => similarity(w, d.generic.toLowerCase()) >= 0.85 || d.brands.some((b) => similarity(w, b.toLowerCase()) >= 0.9)));
  if (drugMentioned) add("medicine", /\b(take|taking|give|giving|dose|tablet)\b/.test(t) ? 4.5 : 2.5);

  if (/\b(doctor (say|said|recommend|advise|told)|dr\.? \w+ (say|said)|ask (my )?doctor|tell (my )?doctor|doctor('s)? (advice|guidance|instruction))/.test(t)) add("doctor_question", 3);

  const symptomConcepts = concepts.filter((c) => !c.negated && c.category === "symptom");
  if (symptomConcepts.length) add("symptoms", 2 + symptomConcepts.length);
  if (/\b(since|for (\d+|a|two|three|few) (day|days|week|weeks)|hurts|pain|ache|feel(ing)? (sick|unwell|ill|bad))\b/.test(t)) add("symptoms", 1);

  if (present.has("sleep_problem") || /\bsleep(ing)?\b/.test(t)) add("sleep", 3);
  if (present.has("exercise") || /\b(exercise|work ?out|gym|walk|run|yoga)\b/.test(t)) add("exercise", 2.5);
  if (/\bcan i (exercise|work ?out|go for a (walk|run)|go running)\b/.test(t)) add("exercise", 3);
  if (present.has("nutrition") || /\b(diet|eat|food|meal|recipe|snack|calorie)\b/.test(t)) add("nutrition", 2.5);
  if (present.has("stress") || /\b(stress|anxious|anxiety|overwhelmed|low mood|depress|lonely)\b/.test(t)) add("mental_wellbeing", 3);
  if (/\b(appointment|book|schedule|visit|consultation|see (a|the|my) doctor)\b/.test(t)) add("appointments", 3);
  if (/\b(weather|heat|hot day|cold day|pollution|aqi|air quality|uv)\b/.test(t)) add("general_health", 1);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { intent: "general_health", secondaryIntents: [], confidence: 0.4 };
  const [intent, score] = ranked[0]!;
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  return {
    intent,
    secondaryIntents: ranked.slice(1, 3).map(([i]) => i),
    confidence: Math.round(Math.min(0.95, 0.35 + (score / total) * 0.6) * 100) / 100,
  };
}
