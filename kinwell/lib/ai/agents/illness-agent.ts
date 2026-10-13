import "server-only";
import { ageFromDob } from "@/lib/utils/format";
import { PatientContextService } from "../services/patient-context";
import { excerpt, retrieveDoctorKnowledge, retrieveReference } from "../services/retrieval";
import { baseResponse, cardId, type AgentContext, type AgentResult } from "./context";
import type { ChatCard } from "../types";
import { REFERENCE_TOPICS } from "@/lib/clinical/reference";

/**
 * Illness & Symptom Agent. Asks the highest-value clinical questions progressively (one at a time), checks the
 * profile before asking things already known, then gives calm, non-diagnostic guidance with clear escalation.
 */
export async function illnessAgent(ctx: AgentContext): Promise<AgentResult> {
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const newConcepts = ctx.concepts.filter((c) => !c.negated && c.category === "symptom").map((c) => c.code);
  const flow = ctx.state.symptomFlow ?? { concepts: [], asked: [], answers: {} };
  // Record the answer to the last question asked.
  const lastAsked = flow.asked.at(-1);
  if (lastAsked && !flow.answers[lastAsked]) flow.answers[lastAsked] = ctx.message.slice(0, 300);
  flow.concepts = [...new Set([...flow.concepts, ...newConcepts])];
  const primary = flow.concepts.find((c) => REFERENCE_TOPICS[c]) ?? flow.concepts[0];
  const topic = primary ? REFERENCE_TOPICS[primary] : undefined;

  if (!primary) {
    const q = "I'm sorry you're not feeling well. What's the main symptom, and when did it start?";
    return { agent: "IllnessAgent", text: q, cards: [], state: { ...ctx.state, symptomFlow: flow, lastIntent: "symptoms" }, response: baseResponse(ctx, { clarifyingQuestions: [q] }) };
  }

  // Duration may already be in the first message ("for three days") — don't ask again.
  const durationInMessage = /(\d+|one|two|three|four|five|a few|couple of)\s*(day|days|week|weeks|hours?)|since (yesterday|this morning|last night|today|this afternoon|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(ctx.message + " " + Object.values(flow.answers).join(" "));
  const temperatureInMessage = /\b(3[5-9]|4[0-2])(\.\d)?\s*(°|deg|c\b)|\b(9[5-9]|10[0-7])(\.\d)?\s*(°|deg|f\b)/i.test(ctx.message);
  const nextQ = topic?.questions.find((q) => !flow.asked.includes(q.key) && !(q.key.includes("duration") && durationInMessage) && !(q.key === "temperature" && temperatureInMessage));
  if (nextQ && flow.asked.length < 2) {
    flow.asked.push(nextQ.key);
    const cards: ChatCard[] = nextQ.quickReplies ? [{ id: cardId(), type: "quick_replies", options: nextQ.quickReplies.map((o) => ({ label: o, value: o })) }] : [];
    const lead = flow.asked.length === 1 ? (ctx.profile.relationship === "self" ? "I'm sorry you're dealing with this. " : `I'm sorry ${ctx.profile.display_name} isn't feeling well. `) : "Thanks, that helps. ";
    return {
      agent: "IllnessAgent",
      text: lead + nextQ.text,
      cards,
      state: { ...ctx.state, symptomFlow: flow, lastIntent: "symptoms" },
      response: baseResponse(ctx, { clarifyingQuestions: [nextQ.text], summary: `Gathering details about ${topic?.title ?? primary}` }),
    };
  }

  // Enough context: build guidance.
  const answersText = Object.values(flow.answers).join(" ").toLowerCase();
  const redFlagAnswer = /\byes\b|one of these|can't keep|blood|chest pain|breathless|wheezy|less than usual/.test(answersText) && !/none of these|^no\b/.test(answersText);
  const age = ctx.profile.age ?? ageFromDob(ctx.profile.date_of_birth);
  const conditions = await patient.conditions();
  const allergies = await patient.allergies();
  const meds = await patient.activeMedications();
  const instructions = await patient.doctorInstructions(flow.concepts);
  const knowledge = await retrieveDoctorKnowledge(ctx.doctor?.id ?? null, `${topic?.title ?? primary} ${ctx.message} self care when to see doctor`, ctx.sources, { k: 2 });
  const refs = retrieveReference(flow.concepts, ctx.sources);
  const vulnerable = (age != null && (age < 5 || age >= 65)) || conditions.some((c) => /diabet|heart|kidney|copd|asthma|cancer|pregnan/i.test(c.name)) || ctx.profile.pregnancy_status === "pregnant";
  const daysMatch = (ctx.message + " " + answersText).match(/(\d+)\s*(day|week)/);
  const days = daysMatch ? Number(daysMatch[1]) * (daysMatch[2] === "week" ? 7 : 1) : null;
  const longDuration = days != null && topic ? days >= topic.reviewThresholdDays : false;
  const reviewRecommended = redFlagAnswer || vulnerable || longDuration;
  const urgency = redFlagAnswer ? "HIGH" : reviewRecommended ? "MODERATE" : "LOW";

  // Nothing is written to the record here: the symptom is offered as a proposal card the user can confirm.
  const doctorItems = [
    ...instructions.map((i) => ({ kind: "instruction" as const, title: `Instruction for ${ctx.profile.display_name}`, text: i.instruction, version: i.version, date: new Date(i.created_at).toISOString() })),
    ...knowledge.map((k) => ({ kind: "knowledge" as const, title: k.title, text: excerpt(k, `${topic?.title} self care fluids rest when doctor`), documentId: k.document_id, version: k.version })),
  ];

  const lines: string[] = [];
  const who = ctx.profile.relationship === "self" ? "you" : ctx.profile.display_name;
  if (redFlagAnswer) lines.push(`Based on what you've shared, it would be best for ${who} to be checked by a doctor soon — today if possible.`);
  else lines.push(refs[0]?.overview ?? `Thanks for the details about ${who}.`);
  if (doctorItems.length) lines.push(`${ctx.doctor?.name ?? "Your doctor"} has guidance on this, shown below — please follow it first.`);
  if (allergies.length) lines.push(`I've kept in mind the recorded allergies (${allergies.map((a) => a.substance).join(", ")}).`);
  if (vulnerable && !redFlagAnswer) lines.push(`Because of ${age != null && age >= 65 ? "age" : age != null && age < 5 ? "young age" : "existing health conditions"}, it's sensible to have a lower threshold for checking in with the doctor.`);

  const cards: ChatCard[] = [];
  if (doctorItems.length) cards.push({ id: cardId(), type: "doctor_guidance", doctorName: ctx.doctor?.name ?? "Your doctor", items: doctorItems });
  if (topic) {
    cards.push({ id: cardId(), type: "info", tone: "info", title: `Self-care for ${topic.title.toLowerCase()}`, body: topic.selfCare.map((s) => `• ${s}`).join("\n") });
    cards.push({ id: cardId(), type: "info", tone: "warning", title: "Get urgent help if you notice", body: topic.seekHelp.map((s) => `• ${s}`).join("\n") });
  }
  cards.push({
    id: cardId(),
    type: "record_proposal",
    kind: "symptom",
    profileId: ctx.profile.id,
    profileName: ctx.profile.display_name,
    label: `Add "${topic?.title ?? primary}${days ? ` for ${days} day${days === 1 ? "" : "s"}` : ""}" to ${ctx.profile.display_name}'s symptom history?`,
    payload: { description: `${topic?.title ?? primary}${days ? ` (${days} days)` : ""}`, concepts: flow.concepts, conversationId: ctx.conversation.id },
    status: "pending",
  });
  cards.push({
    id: cardId(),
    type: "actions",
    actions: [
      ...(reviewRecommended ? [{ label: "Send to doctor for review", kind: "send_review" as const, variant: "primary" as const }] : [{ label: "Ask doctor", kind: "send_review" as const }]),
      { label: "Book appointment", kind: "link", href: `/appointments?new=1&profile=${ctx.profile.id}` },
      { label: "Find a clinic", kind: "link", href: `/providers?speciality=${encodeURIComponent(topic?.speciality ?? "General Practice")}` },
    ],
  });
  if (meds.length && /fever|headache|pain/.test(primary)) {
    lines.push("Before taking any new pain or fever medicine, check it suits the current medicines — I can help with that if you tell me which one.");
  }
  lines.push(topic?.contactDoctorWhen ?? "If things aren't improving, please contact your doctor.");

  return {
    agent: "IllnessAgent",
    text: lines.join(" "),
    cards,
    state: { ...ctx.state, symptomFlow: null, lastIntent: "symptoms" },
    response: baseResponse(ctx, {
      intent: "symptoms",
      urgency,
      summary: `${topic?.title ?? primary} — ${Object.values(flow.answers).join("; ")}`.slice(0, 400),
      possibleExplanations: topic?.commonCauses ?? [],
      selfCare: topic?.selfCare ?? [],
      redFlags: topic?.seekHelp ?? [],
      doctorReviewRecommended: reviewRecommended,
      doctorSpeciality: reviewRecommended ? topic?.speciality ?? "General Practice" : null,
      suggestedActions: ["send_review", "book_appointment"],
      medicalSources: refs.map((r) => `Kinwell reference: ${r.title}`),
      doctorSources: doctorItems.map((d) => d.title),
      recordUpdates: [{ kind: "symptom", description: topic?.title ?? primary }],
    }),
  };
}
