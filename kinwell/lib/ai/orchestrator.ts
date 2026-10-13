import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/database/client";
import { assertFamilyAccess } from "@/lib/security/access";
import { getClinicalTerminology } from "@/lib/integrations/terminology/clinical";
import { loadClinicalRules } from "@/lib/clinical/rules-repo";
import { evaluateTriage } from "@/lib/clinical/triage";
import { decideConfidence } from "@/lib/config/confidence";
import { ageFromDob } from "@/lib/utils/format";
import { RELATIONSHIP_LABELS, type Actor, type Profile } from "@/types/domain";
import { appendMessage, getConversation, updateConversationState, type ConversationState, type Message } from "@/lib/services/conversations";
import { getAIProvider } from "./providers";
import { agentResponseSchema, routerOutputSchema, type ChatCard, type Intent } from "./types";
import { baseResponse, cardId, SourceTracker, type AgentContext, type AgentResult } from "./agents/context";
import { detectProfileMention } from "./agents/family-context";
import { routeMessage } from "./agents/router";
import { emergencyResult } from "./agents/safety";
import { measurementAgent } from "./agents/measurement-agent";
import { illnessAgent } from "./agents/illness-agent";
import { medicationAgent } from "./agents/medication-agent";
import { reportAgent } from "./agents/report-agent";
import { coachAgent, exerciseAgent, nutritionAgent, sleepAgent, wellbeingAgent } from "./agents/lifestyle-agents";
import { appointmentAgent, doctorQuestionAgent, generalAgent } from "./agents/misc-agents";
import { composeReply } from "./services/composer";
import { historyAgent, isHistoryQuestion } from "./agents/timeline-agent";
import { features } from "@/lib/config/features";
import { guidedAgent, startLipidFromText, titleFromState, vetEmergencyFromText, CTA_LABELS } from "./guided/agent";
import { detectSymptomStart, isMedicineQuestion, mentionedSubject, parseLipids } from "./guided/detect";
import { withEnglishReading } from "@/lib/clinical/lexicon";
import { classifySymptom } from "@/lib/clinical/knowledge/classify";
import { knowledgeAgent } from "./agents/knowledge-agent";
import { recordAssessment } from "@/lib/services/assessment-audit";
import type { GuidedStart } from "./guided/detect";
import type { StructuredAnswer } from "./guided/types";

const AGENTS: Record<Intent, (ctx: AgentContext) => Promise<AgentResult>> = {
  measurements: measurementAgent,
  symptoms: illnessAgent,
  illness: illnessAgent,
  medicine: medicationAgent,
  reports: reportAgent,
  exercise: exerciseAgent,
  nutrition: nutritionAgent,
  sleep: sleepAgent,
  mental_wellbeing: wellbeingAgent,
  appointments: appointmentAgent,
  doctor_question: doctorQuestionAgent,
  general_health: generalAgent,
  check_in: coachAgent,
  smalltalk: coachAgent,
  emergency: generalAgent,
};

export interface TurnResult {
  userMessage: Message | null;
  assistantMessage: Message;
}

interface HandleOptions {
  /** Skip saving the user message (used when re-running after a profile switch). */
  replay?: boolean;
  skipProfileDetection?: boolean;
  /** A tapped answer to an in-chat question (chips, scales, number entry…). The text is its display label. */
  answer?: StructuredAnswer;
}

/** Hidden in the patient-first MVP: anything that leads to the doctor portal, appointments or dashboards. */
const HIDDEN_HREF = /^\/(appointments|care|providers|health|settings|search|emergency)\b/;
function isPatientAction(a: { kind: string; href?: string }) {
  if (a.kind === "send_review" || a.kind === "book_appointment") return false;
  if (a.kind === "link" && a.href && HIDDEN_HREF.test(a.href)) return false;
  return true;
}

/** Maps agent speciality labels onto the doctor categories patients recognise. */
function doctorCategory(raw: string | null): string {
  if (!raw) return "General Physician";
  if (/endocrin|diabet/i.test(raw)) return /endocrin/i.test(raw) && !/diabet/i.test(raw) ? "Endocrinologist" : "Diabetologist";
  if (/cardio/i.test(raw) && !/general/i.test(raw)) return "Cardiologist";
  if (/derma/i.test(raw)) return "Dermatologist";
  if (/paediat|pediat/i.test(raw)) return "Paediatrician";
  if (/gastro/i.test(raw)) return "Gastroenterologist";
  if (/pulmo|chest/i.test(raw)) return "Pulmonologist";
  if (/ortho/i.test(raw)) return "Orthopaedic Doctor";
  if (/neuro/i.test(raw)) return "Neurologist";
  if (/ent\b|otolaryn/i.test(raw)) return "ENT Specialist";
  if (/gyn/i.test(raw)) return "Gynaecologist";
  return "General Physician";
}

/**
 * Orchestrates one conversational turn:
 *   save message → terminology → TRIAGE (always first) → family context → router → specialist agent →
 *   escalation → composer → audit log → persist.
 */
export async function handleUserMessage(actor: Actor, conversationId: string, rawText: string, opts: HandleOptions = {}): Promise<TurnResult> {
  const text = rawText.trim().slice(0, 4000);
  if (!text) throw new Error("Message is empty");
  const { conversation, messages } = await getConversation(actor, conversationId);
  await assertFamilyAccess(actor, conversation.family_id, "write");
  const db = await getDb();

  const userMessage = opts.replay ? null : await appendMessage(conversationId, { role: "user", content: text, profileId: conversation.active_profile_id, authorUserId: actor.id });
  if (!opts.replay && conversation.title === "New health chat" && !opts.answer) {
    await updateConversationState(conversationId, conversation.state, { title: text.length > 42 ? text.slice(0, 40).trimEnd() + "…" : text });
  }
  // The tapped question is answered: close it so its buttons can't be used again.
  if (opts.answer) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant?.cards.some((c) => c.type === "question" && c.status === "open")) {
      const updated = lastAssistant.cards.map((c) => (c.type === "question" && c.status === "open" ? { ...c, status: "answered" as const, answerLabel: text } : c));
      await db.query("update messages set cards = $2::jsonb where id = $1", [lastAssistant.id, JSON.stringify(updated)]);
      lastAssistant.cards = updated;
    }
  }

  const profiles = (await db.query<Profile>("select * from profiles where family_id = $1", [conversation.family_id])).rows;
  const active = profiles.find((p) => p.id === conversation.active_profile_id)!;
  const family = (await db.query<{ country_code: string }>("select country_code from families where id = $1", [conversation.family_id])).rows[0]!;
  const doctorRow = (await db.query<{ id: string; full_name: string; accepting_reviews: boolean }>(
    "select d.id, d.full_name, d.accepting_reviews from doctor_family_assignments a join doctors d on d.id = a.doctor_id where a.family_id = $1 and a.status = 'active'",
    [conversation.family_id],
  )).rows[0];

  const terminology = getClinicalTerminology();
  // Tapped answers are structured; only typed text goes through concept extraction and triage.
  // Concepts are read from the message plus its English reading (Hindi, Punjabi, Hinglish, misspellings).
  const concepts = opts.answer ? [] : await terminology.extractConcepts(withEnglishReading(text));
  const sources = new SourceTracker();
  const ctx: AgentContext = {
    actor,
    conversation,
    profile: { ...active, age: ageFromDob(active.date_of_birth) },
    familyProfiles: profiles,
    familyId: conversation.family_id,
    countryCode: family.country_code,
    // The doctor portal (reviews, doctor knowledge) is outside the patient-first MVP.
    doctor: doctorRow && features.doctorPortal ? { id: doctorRow.id, name: doctorRow.full_name, acceptingReviews: doctorRow.accepting_reviews } : null,
    message: text,
    history: messages.slice(-10),
    concepts,
    state: { ...(conversation.state ?? {}) },
    intent: "general_health",
    sources,
    answerId: randomUUID(),
  };

  let result: AgentResult;
  try {
    result = await runPipeline(ctx, opts);
  } catch (e) {
    console.error("[orchestrator] agent failure", e);
    result = {
      agent: "Orchestrator",
      text: "I couldn't complete that health response safely. Please try again — and if this is urgent, contact your doctor or emergency services.",
      cards: [{ id: cardId(), type: "quick_replies", options: [{ label: "Try again", value: text }] }],
      lockText: true,
      response: baseResponse(ctx, { summary: "Agent failure" }),
    };
  }

  // Validate internal structured output before anything is shown (defence against malformed agent/LLM output).
  const parsed = agentResponseSchema.safeParse(result.response);
  if (!parsed.success) {
    result = { ...result, text: "I couldn't complete that health response safely. Please try again.", cards: [], lockText: true, response: baseResponse(ctx, { summary: "Invalid structured output" }) };
  }

  // Patient-first MVP: strip doctor-portal, appointment and dashboard actions from every card.
  result.cards = result.cards
    .filter((c) => features.doctorPortal || c.type !== "doctor_guidance")
    .map((c) => (c.type === "actions" ? { ...c, actions: c.actions.filter(isPatientAction) } : c.type === "measurement_result" ? { ...c, actions: c.actions.filter(isPatientAction) } : c))
    .filter((c) => c.type !== "actions" || c.actions.length > 0);

  // When a doctor visit is sensible, say which kind of doctor — and offer to find one or call My Doctor.
  const hasRecommendation = result.cards.some((c) => c.type === "doctor_recommendation" || c.type === "emergency");
  if (result.response.doctorReviewRecommended && !hasRecommendation && result.response.urgency !== "EMERGENCY") {
    const speciality = doctorCategory(result.response.doctorSpeciality);
    result.cards.push({
      id: cardId(),
      type: "doctor_recommendation",
      speciality,
      reason: speciality === "General Physician" ? "A General Physician would be a good starting point to review this with you." : `${/^[AEIOU]/.test(speciality) ? "An" : "A"} ${speciality} commonly looks after this.`,
      timing: result.response.urgency === "HIGH" ? "soon" : "routine",
      profileId: active.id,
      status: "open",
    });
  }

  // Every assessment ends with one care level: Emergency now · Same-day care · See a doctor/vet · Monitor.
  const assessed = result.cards.some((c) => ["measurement_result", "report_summary", "doctor_recommendation", "emergency", "info", "medication_info"].includes(c.type));
  const questionOnlyTurn = result.response.clarifyingQuestions.length > 0 && result.cards.every((c) => c.type === "question" || c.type === "quick_replies");
  const ASSESSING_AGENTS = ["MeasurementAgent", "IllnessAgent", "ReportAgent", "MedicationAgent", "TriageSafetyEngine", "HealthGuide"];
  if (assessed && !questionOnlyTurn && ASSESSING_AGENTS.includes(result.agent) && !result.cards.some((c) => c.type === "care_level")) {
    const r = result.response;
    const level = r.urgency === "EMERGENCY" ? "emergency" : r.urgency === "HIGH" ? "same_day" : r.doctorReviewRecommended ? "clinician" : "monitor";
    result.cards.unshift({ id: cardId(), type: "care_level", level, audience: active.relationship === "pet" ? "vet" : "human" });
  }

  const ai = getAIProvider();
  const audience = active.relationship === "self" ? "the user themself" : `a family member caring for ${active.display_name} (${RELATIONSHIP_LABELS[active.relationship]})`;
  const composed = await composeReply(ai, result, audience);

  // Sources card: "Where this answer came from"
  const sourceItems: Extract<ChatCard, { type: "sources" }>["items"] = [];
  if (sources.doctorInstructions.length) sourceItems.push({ kind: "doctor_instruction", label: `${sources.doctorInstructions.length} patient-specific instruction${sources.doctorInstructions.length === 1 ? "" : "s"} from ${ctx.doctor?.name ?? "your doctor"}` });
  for (const d of sources.knowledgeDocuments.values()) sourceItems.push({ kind: "doctor_knowledge", label: `${d.title} (v${d.version}) · ${d.doctor}` });
  const recordSections = [...sources.contextSections].filter((s) => !s.startsWith("reference:") && !["doctor_instructions", "doctor_knowledge"].includes(s));
  if (recordSections.length) sourceItems.push({ kind: "patient_record", label: `${active.display_name}'s record: ${recordSections.map((s) => s.replace(/^measurements:/, "").replace(/^lab:/, "").replace(/_/g, " ")).join(", ")}` });
  for (const r of sources.rules) sourceItems.push({ kind: "clinical_rule", label: `Clinical rule ${r.rule_key} v${r.version}` });
  for (const s of sources.contextSections) if (s.startsWith("reference:")) sourceItems.push({ kind: "reference", label: s.replace("reference:", "General health information: ") });
  const isQuestionOnly = result.response.clarifyingQuestions.length > 0 && result.cards.every((c) => c.type === "quick_replies" || c.type === "question");
  if (!sourceItems.length && !isQuestionOnly) sourceItems.push({ kind: "general", label: "General health information (not personalised)" });
  const cards = [...result.cards];
  if (sourceItems.length && !isQuestionOnly && !["DailyHealthCoach", "Orchestrator", "FamilyContextAgent", "TriageSafetyEngine"].includes(result.agent) && !(result.agent === "HealthGuide" && result.cards.some((c) => c.type === "doctor_results"))) cards.push({ id: cardId(), type: "sources", answerId: ctx.answerId, items: sourceItems });

  const assistantMessage = await appendMessage(conversationId, {
    role: "assistant",
    content: composed.text,
    cards,
    profileId: active.id,
    urgency: result.response.urgency,
    answerId: ctx.answerId,
  });

  await db.query(
    `insert into agent_audit_logs(answer_id, conversation_id, message_id, profile_id, family_id, doctor_id, agent, intent, urgency, provider, model,
      knowledge_documents_used, retrieved_chunks, clinical_rules_used, medications_referenced, doctor_instructions_used, context_sections)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb)`,
    [
      ctx.answerId,
      conversationId,
      assistantMessage.id,
      active.id,
      conversation.family_id,
      ctx.doctor?.id ?? null,
      result.agent,
      result.response.intent,
      result.response.urgency,
      ai.name + (composed.polished ? "+composer" : ""),
      ai.model,
      JSON.stringify([...sources.knowledgeDocuments.values()]),
      JSON.stringify(sources.chunks),
      JSON.stringify(sources.rules),
      JSON.stringify(sources.medications),
      JSON.stringify(sources.doctorInstructions),
      JSON.stringify([...sources.contextSections]),
    ],
  );

  if (result.state) {
    // Useful chat titles from the structured state ("Left-side chest pain", "Mom's cough").
    const autoTitle = result.state.autoTitle !== false;
    const fresh = conversation.title === "New health chat" || CTA_LABELS.includes(conversation.title) || conversation.title === text.slice(0, 40) || conversation.state?.guided != null;
    const better = autoTitle && fresh ? titleFromState(result.state.guided, active) : null;
    await updateConversationState(conversationId, result.state, better && better !== conversation.title ? { title: better } : undefined);
  } else if (opts.answer && conversation.title === "New health chat") {
    await updateConversationState(conversationId, conversation.state, { title: text.slice(0, 60) });
  }
  return { userMessage, assistantMessage };
}

async function runPipeline(ctx: AgentContext, opts: HandleOptions): Promise<AgentResult> {
  const rules = await loadClinicalRules();

  // 1) Safety first: every typed message goes through triage before anything else (including profile questions).
  //    Tapped answers are screened by the guided engine's own red-flag rules.
  const triage = evaluateTriage(ctx.concepts, rules);
  for (const m of triage.matchedRules) ctx.sources.rule({ id: m.id, rule_key: m.rule_key, version: m.version, source: "triage" });
  if (triage.isEmergency) {
    ctx.intent = "emergency";
    const aboutPet = ctx.profile.relationship === "pet" || (mentionedSubject(ctx.message) === "pet" && !triage.crisis);
    await recordAssessment({ familyId: ctx.familyId, profileId: ctx.profile.id, conversationId: ctx.conversation.id, flow: "triage", complaint: null, answers: {}, redFlags: triage.matchedRules.map((m) => m.label), careLevel: "emergency", speciality: null, possibilities: [], ruleVersions: triage.matchedRules.map((m) => ({ rule_key: m.rule_key, version: m.version })) });
    if (aboutPet) return vetEmergencyFromText(ctx, triage.matchedRules.map((m) => m.label));
    return emergencyResult(ctx, triage);
  }

  // 2) Guided, tap-to-answer flows: structured answers, open guided questions, or a symptom described in text.
  if (opts.answer || ctx.state.guided || ctx.state.followUpId) {
    const start = opts.answer ? null : detectSymptomStart(ctx.message, ctx.concepts);
    const routed = opts.answer ? null : routeMessage(withEnglishReading(ctx.message), ctx.concepts, { ...ctx.state, symptomFlow: null, pending: null });
    const leavingFlow = !opts.answer && !start && routed && ["medicine", "reports", "measurements", "nutrition", "exercise", "sleep", "mental_wellbeing"].includes(routed.intent) && routed.confidence >= 0.6 && ctx.message.split(/\s+/).length > 3;
    if (!leavingFlow) {
      const out = await guidedAgent(ctx, { answer: opts.answer, freeText: opts.answer ? undefined : ctx.message, start });
      if (out && "reroute" in out) {
        ctx.message = out.reroute;
        ctx.concepts = await getClinicalTerminology().extractConcepts(out.reroute);
        ctx.state = { ...ctx.state, guided: null };
      } else if (out) {
        if (opts.answer) ctx.intent = out.response.intent;
        return out;
      } else ctx.state = { ...ctx.state, guided: null };
    } else ctx.state = { ...ctx.state, guided: null };
  }

  // 2b) A baby or a pet mentioned in text: their safety modes start by confirming who it's about.
  //     A medicine question about a baby or a pet gets its safety answer straight away (nothing is saved).
  if (!opts.answer && mentionedSubject(ctx.message) && isMedicineQuestion(ctx.message)) {
    ctx.intent = "medicine";
    return medicationAgent(ctx);
  }
  if (!opts.answer && mentionedSubject(ctx.message)) {
    const out = await guidedAgent(ctx, { start: {}, freeText: ctx.message });
    if (out && !("reroute" in out)) {
      ctx.intent = "symptoms";
      return out;
    }
  }

  // 3) Who is this about? Never silently attribute health information to the wrong person.
  if (!opts.skipProfileDetection) {
    const detection = detectProfileMention(ctx.message, ctx.familyProfiles, ctx.profile.id);
    if (detection.missingRelationship) {
      const label = RELATIONSHIP_LABELS[detection.missingRelationship].toLowerCase();
      return {
        agent: "FamilyContextAgent",
        text: `It sounds like this is about your ${label}, but there isn't a profile for them yet. Add one so their health information stays separate from ${ctx.profile.display_name}'s?`,
        cards: [{ id: cardId(), type: "actions", actions: [{ label: `Add ${label}'s profile`, kind: "link", href: `/family?new=${detection.missingRelationship}`, variant: "primary" }, { label: `Continue as ${ctx.profile.display_name}`, kind: "quick_reply", value: `(about ${ctx.profile.display_name}) ${ctx.message}` }] }],
        state: { ...ctx.state },
        response: baseResponse(ctx, { summary: "Missing profile for mentioned relative" }),
      };
    }
    if (detection.subjectChanged && !/^\(about /.test(ctx.message)) {
      const candidates = detection.candidates.length ? detection.candidates : [];
      const confident = decideConfidence("profile_detection", detection.confidence) === "accept";
      const cards: ChatCard[] = candidates.slice(0, 3).map((c) => ({
        id: cardId(),
        type: "profile_switch",
        profileId: c.id,
        profileName: c.name,
        currentProfileName: ctx.profile.display_name,
        question: `Is this about the profile for ${c.name}?`,
        originalMessage: ctx.message,
        status: "pending",
      }));
      await getDb().then((db) => db.query("update conversations set mentioned_profile_id = $2, profile_confidence = $3 where id = $1", [ctx.conversation.id, detection.mentionedProfileId, detection.confidence]));
      return {
        agent: "FamilyContextAgent",
        text: candidates.length > 1 ? "Who is this about?" : confident ? `It sounds like this is about ${candidates[0]!.name}. Should I switch this conversation to ${candidates[0]!.name}'s profile?` : `Is this about the profile for ${candidates[0]!.name}?`,
        cards,
        state: { ...ctx.state, pendingProfileSwitch: candidates[0] ? { profileId: candidates[0].id, name: candidates[0].name, originalMessage: ctx.message } : null },
        response: baseResponse(ctx, { summary: "Profile confirmation needed", clarifyingQuestions: [`Is this about ${candidates[0]?.name}?`] }),
      };
    }
  }
  if (/^\(about [^)]+\) /.test(ctx.message)) ctx.message = ctx.message.replace(/^\(about [^)]+\) /, "");

  // 4) Questions about the person's own history are answered from their records.
  if (isHistoryQuestion(ctx.message)) {
    ctx.intent = "reports";
    return historyAgent(ctx);
  }

  // 4a) Cholesterol numbers typed in ("My LDL is 172") are interpreted in context, with risk factors.
  const lipids = parseLipids(ctx.message);
  if (lipids) {
    const out = await startLipidFromText(ctx, lipids);
    if (!("reroute" in out)) {
      ctx.intent = "measurements";
      return out;
    }
  }

  // 4) A newly described symptom continues as a tap-to-answer flow.
  const symptomStart = detectSymptomStart(ctx.message, ctx.concepts);
  const preRoute = symptomStart ? routeMessage(withEnglishReading(ctx.message), ctx.concepts, ctx.state) : null;
  const symptomIntents = ["symptoms", "illness", "general_health", "emergency", ...(symptomStart?.complaint === "mood" ? ["mental_wellbeing"] : [])];
  if (symptomStart && preRoute && symptomIntents.includes(preRoute.intent)) {
    const out = await guidedAgent(ctx, { start: symptomStart, freeText: ctx.message });
    if (out && !("reroute" in out)) {
      ctx.intent = "symptoms";
      return out;
    }
  }

  // 4b) A symptom recognised from the 26-domain knowledge registry: start its guided check if it has one,
  //     otherwise (without a configured AI model) give safe general guidance and the right type of clinician.
  if (!opts.answer) {
    const match = classifySymptom(ctx.message);
    const r = match ? routeMessage(withEnglishReading(ctx.message), ctx.concepts, ctx.state) : null;
    if (match && r && ["symptoms", "illness", "general_health"].includes(r.intent) && match.domain.code !== "lifestyle") {
      const flow = match.symptom.flow;
      if (flow) {
        const [complaint, detail] = flow.split(":");
        const start: GuidedStart = complaint === "pain" ? { complaint: "pain", bodyArea: detail } : complaint === "other" ? { complaint: "other", symptomType: detail } : { complaint: complaint as GuidedStart["complaint"] };
        const out = await guidedAgent(ctx, { start, freeText: ctx.message });
        if (out && !("reroute" in out)) {
          ctx.intent = "symptoms";
          return out;
        }
      } else if (getAIProvider().isMock) {
        ctx.intent = "symptoms";
        return knowledgeAgent(ctx, match);
      }
    }
  }

  // 5) Route
  let route = routeMessage(withEnglishReading(ctx.message), ctx.concepts, ctx.state);
  const ai = getAIProvider();
  if (!ai.isMock && route.confidence < 0.7) {
    try {
      // Only the message text is sent for routing — no medical history.
      const llm = await ai.structuredOutput({
        system: "Classify the user's health-app message into one intent. Use 'symptoms' for describing feeling unwell, 'measurements' for readings, 'medicine' for medication questions, 'reports' for lab reports.",
        messages: [{ role: "user", content: ctx.message }],
        schema: routerOutputSchema,
        schemaName: "route",
        maxTokens: 300,
      });
      if (llm.confidence > route.confidence) route = llm;
    } catch {
      /* rule-based route stands */
    }
  }
  // Non-emergency triage levels still shape symptom handling.
  ctx.intent = route.intent === "emergency" ? "symptoms" : route.intent;
  if (triage.level === "HIGH" && !["symptoms", "measurements", "medicine"].includes(ctx.intent)) ctx.intent = "symptoms";
  const agent = AGENTS[ctx.intent] ?? generalAgent;
  const result = await agent(ctx);

  if (triage.level === "HIGH" && result.response.urgency !== "EMERGENCY") {
    result.response.urgency = "HIGH";
    result.response.doctorReviewRecommended = true;
    result.text = `${triage.matchedRules[0]?.action ?? "This should be checked by a doctor soon."} ${result.text}`;
    result.cards.unshift({ id: cardId(), type: "info", tone: "warning", title: "Please get this checked soon", body: triage.matchedRules.map((m) => `• ${m.label}: ${m.action}`).join("\n") });
  }
  return result;
}

/** Resolves a "Is this about Mom?" card: switch (and re-run the original message) or keep the current profile. */
export async function resolveProfileSwitch(actor: Actor, conversationId: string, messageId: string, cardIdValue: string, decision: "switch" | "keep") {
  const { conversation, messages } = await getConversation(actor, conversationId);
  const msg = messages.find((m) => m.id === messageId);
  const card = msg?.cards.find((c): c is Extract<ChatCard, { type: "profile_switch" }> => c.type === "profile_switch" && c.id === cardIdValue);
  if (!msg || !card) throw new Error("This question is no longer available.");
  const db = await getDb();
  const updated = msg.cards.map((c) => (c.type === "profile_switch" ? { ...c, status: c.id === cardIdValue && decision === "switch" ? "switched" : "kept" } : c));
  await db.query("update messages set cards = $2::jsonb where id = $1", [messageId, JSON.stringify(updated)]);
  const state: ConversationState = { ...conversation.state, pendingProfileSwitch: null };
  await updateConversationState(conversationId, state);
  if (decision === "switch") {
    const { setActiveProfile } = await import("@/lib/services/conversations");
    await setActiveProfile(actor, conversationId, card.profileId, 1);
  }
  return handleUserMessage(actor, conversationId, card.originalMessage, { replay: true, skipProfileDetection: true });
}
