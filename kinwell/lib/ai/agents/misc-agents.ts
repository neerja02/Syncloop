import "server-only";
import { getAIProvider } from "../providers";
import { HEALTH_AGENT_SYSTEM_PROMPT } from "../prompts/health-agent";
import { getDb } from "@/lib/database/client";
import { PatientContextService } from "../services/patient-context";
import { excerpt, retrieveDoctorKnowledge, retrieveReference } from "../services/retrieval";
import { baseResponse, cardId, type AgentContext, type AgentResult } from "./context";
import type { ChatCard } from "../types";

export async function appointmentAgent(ctx: AgentContext): Promise<AgentResult> {
  const db = await getDb();
  ctx.sources.section("appointments");
  const upcoming = (await db.query<{ id: string; starts_at: Date; status: string; doctor_name: string | null; provider_name: string | null }>(
    "select a.id, a.starts_at, a.status, d.full_name as doctor_name, a.provider_name from appointments a left join doctors d on d.id = a.doctor_id where a.profile_id = $1 and a.status in ('requested','confirmed') and a.starts_at >= now() order by a.starts_at limit 3",
    [ctx.profile.id],
  )).rows;
  const lines = upcoming.length
    ? [`Upcoming for ${ctx.profile.display_name}: ${upcoming.map((u) => `${u.doctor_name ?? u.provider_name ?? "Appointment"} on ${new Date(u.starts_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} (${u.status})`).join("; ")}.`]
    : [`There are no upcoming appointments for ${ctx.profile.display_name}.`];
  lines.push(ctx.doctor ? `You can request a time with ${ctx.doctor.name}, and I can prepare a list of things to discuss.` : "You can find a provider and request an appointment.");
  return {
    agent: "AppointmentAgent",
    text: lines.join(" "),
    cards: [{ id: cardId(), type: "actions", actions: [{ label: "Book appointment", kind: "link", href: `/appointments?new=1&profile=${ctx.profile.id}`, variant: "primary" }, { label: "Find a provider", kind: "link", href: "/providers" }] }],
    response: baseResponse(ctx, { intent: "appointments" }),
  };
}

/** "What did my doctor say about…" / "Ask my doctor…" — searches every doctor-authored source. */
export async function doctorQuestionAgent(ctx: AgentContext): Promise<AgentResult> {
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const topics = ctx.concepts.filter((c) => !c.negated).map((c) => c.code);
  const [instructions, notes] = await Promise.all([patient.doctorInstructions(topics), patient.doctorNotes(10)]);
  const words = (ctx.message.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !["what", "doctor", "said", "about", "tell", "with", "does", "should", "have"].includes(w));
  const relNotes = notes.filter((n) => words.some((w) => n.note.toLowerCase().includes(w)) || topics.some((t) => n.note.toLowerCase().includes(t.replace(/_/g, " "))));
  const knowledge = await retrieveDoctorKnowledge(ctx.doctor?.id ?? null, ctx.message, ctx.sources, { k: 3 });
  const items = [
    ...instructions.map((i) => ({ kind: "instruction" as const, title: `Instruction for ${ctx.profile.display_name}`, text: i.instruction, version: i.version })),
    ...relNotes.map((n) => ({ kind: "note" as const, title: `Note from ${n.doctor_name}`, text: n.note, date: new Date(n.created_at).toISOString() })),
    ...knowledge.map((k) => ({ kind: "knowledge" as const, title: k.title, text: excerpt(k, ctx.message), documentId: k.document_id, version: k.version })),
  ];
  const cards: ChatCard[] = [];
  let text: string;
  if (items.length) {
    cards.push({ id: cardId(), type: "doctor_guidance", doctorName: ctx.doctor?.name ?? "Your doctor", items });
    text = `Here's what ${ctx.doctor?.name ?? "your doctor"} has provided that relates to your question.`;
  } else {
    text = `I couldn't find anything from ${ctx.doctor?.name ?? "your doctor"} about this yet. I won't fill the gap with a guess — would you like to send the question to them?`;
  }
  cards.push({ id: cardId(), type: "actions", actions: [{ label: "Send to doctor", kind: "send_review", variant: items.length ? "secondary" : "primary" }, { label: "Message doctor", kind: "link", href: "/care" }] });
  return { agent: "DoctorEscalationService", text, cards, response: baseResponse(ctx, { intent: "doctor_question", doctorSources: items.map((i) => i.title), doctorReviewRecommended: !items.length }) };
}

/** General health questions: doctor knowledge first, then approved reference content. */
/** Patient context for the LLM: who this is about, never other family members' data. */
function patientSummary(ctx: AgentContext) {
  const p = ctx.profile;
  const ls = (p.lifestyle ?? {}) as Record<string, string | number | undefined>;
  if (p.relationship === "pet")
    return `Patient: a pet ${p.species ?? "animal"} named ${p.display_name}${p.breed ? ` (${p.breed})` : ""}${p.age != null ? `, about ${p.age} years old` : ""}${p.weight_kg ? `, ${p.weight_kg} kg` : ""}${p.neutered != null ? `, ${p.neutered ? "neutered" : "not neutered"}` : ""}${ls.diet ? `. Diet: ${ls.diet}` : ""}${ls.vaccinations ? `. Vaccinations: ${ls.vaccinations}` : ""}. Use VETERINARY MODE.`;
  const birth = ls.bornWeeks ? `, born at ${ls.bornWeeks} weeks${Number(ls.bornWeeks) < 37 ? " (preterm)" : ""}` : "";
  return `Patient: ${p.relationship === "self" ? "the user" : `${p.display_name} (the user's ${p.relationship})`}${p.age != null ? `, age ${p.age}` : ""}${p.sex ? `, ${p.sex}` : ""}${p.weight_kg ? `, ${p.weight_kg} kg` : ""}${p.pregnancy_status === "pregnant" ? ", pregnant" : ""}${birth}${ls.feeding ? `, feeding: ${ls.feeding}` : ""}. Country: ${ctx.countryCode}.`;
}

export async function generalAgent(ctx: AgentContext): Promise<AgentResult> {
  // With a real model, open health questions are answered under the master health-agent prompt.
  const ai = getAIProvider();
  if (!ai.isMock) {
    try {
      const patient = new PatientContextService(ctx.profile.id, ctx.sources);
      const [conditions, allergies, meds] = await Promise.all([patient.conditions(), patient.allergies(), patient.activeMedications()]);
      const context = `${patientSummary(ctx)}\nKnown conditions: ${conditions.map((c) => c.name).join(", ") || "none recorded"}. Allergies: ${allergies.map((a) => a.substance).join(", ") || "none recorded"}. Medicines: ${meds.map((m) => m.name).join(", ") || "none recorded"}.`;
      const history = ctx.history.filter((m) => m.role === "user" || m.role === "assistant").slice(-6).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const text = await ai.chat({ system: `${HEALTH_AGENT_SYSTEM_PROMPT}\n\nCONTEXT (from the app, trusted):\n${context}`, messages: [...history.filter((m) => m.content), { role: "user", content: ctx.message }], maxTokens: 700 });
      if (text?.trim()) return { agent: "HealthAgentLLM", text: text.trim(), cards: [], lockText: true, response: baseResponse(ctx, { intent: "general_health", summary: "LLM health answer" }) };
    } catch (e) {
      console.error("[generalAgent] LLM answer failed, using reference content", e);
    }
  }
  const knowledge = await retrieveDoctorKnowledge(ctx.doctor?.id ?? null, ctx.message, ctx.sources, { k: 3 });
  const refs = retrieveReference(ctx.concepts.filter((c) => !c.negated).map((c) => c.code), ctx.sources);
  const cards: ChatCard[] = [];
  const lines: string[] = [];
  if (knowledge.length) {
    cards.push({ id: cardId(), type: "doctor_guidance", doctorName: ctx.doctor?.name ?? "Your doctor", items: knowledge.map((k) => ({ kind: "knowledge" as const, title: k.title, text: excerpt(k, ctx.message), documentId: k.document_id, version: k.version })) });
    lines.push(`I found relevant guidance from ${ctx.doctor?.name ?? "your doctor"}'s library — it's shown below.`);
  }
  if (refs.length) lines.push(refs[0]!.overview);
  if (!lines.length) {
    lines.push("I can help you check a symptom, understand a report or test result, or answer a health question — for you, your family or your pet. What would you like to do?");
    cards.push({ id: cardId(), type: "question", key: "after_care", style: "chips", status: "open", options: [{ label: "Check a Symptom", value: "symptom" }, { label: "Analyse a Report", value: "report" }, { label: "Understand a Test Result", value: "test_result" }, { label: "Ask a Health Question", value: "question" }] });
  }
  return { agent: "GeneralHealthAgent", text: lines.join(" "), cards, response: baseResponse(ctx, { intent: "general_health", doctorSources: knowledge.map((k) => k.title), medicalSources: refs.map((r) => r.title) }) };
}
