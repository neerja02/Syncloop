import "server-only";
import type { SymptomMatch } from "@/lib/clinical/knowledge/classify";
import { baseResponse, cardId, type AgentContext, type AgentResult } from "./context";

/**
 * Safe general guidance for a recognised symptom that doesn't have a step-by-step check yet: what it relates
 * to, warning signs for that area of health, and the right type of clinician. Never a diagnosis.
 */
export function knowledgeAgent(ctx: AgentContext, match: SymptomMatch): AgentResult {
  const { symptom, domain } = match;
  const who = ctx.profile.relationship === "self" ? "you" : ctx.profile.display_name;
  const speciality = ctx.profile.age != null && ctx.profile.age < 14 ? "Paediatrician" : domain.specialties[0]!;
  return {
    agent: "KnowledgeAgent",
    text: `${symptom.name} relates to ${domain.name.toLowerCase()}. I don't have a step-by-step check for it yet, so here's general guidance. As I can't examine ${who}, it's worth speaking with ${/^[AEIOU]/.test(speciality) ? "an" : "a"} ${speciality} about it — sooner if any of the warning signs below apply.`,
    lockText: true,
    cards: [
      { id: cardId(), type: "care_level", level: "clinician", audience: ctx.profile.relationship === "pet" ? "vet" : "human" },
      { id: cardId(), type: "info", tone: "info", title: `About ${domain.name.toLowerCase()}`, body: domain.education },
      { id: cardId(), type: "info", tone: "warning", title: "Get urgent help if you notice", body: domain.warningSigns.map((w) => `• ${w}`).join("\n") },
      { id: cardId(), type: "doctor_recommendation", speciality, reason: `${/^[AEIOU]/.test(speciality) ? "An" : "A"} ${speciality} commonly looks after ${domain.name.toLowerCase()}.`, timing: "routine", profileId: ctx.profile.id, status: "open" },
    ],
    state: { ...ctx.state, lastIntent: "symptoms" },
    response: baseResponse(ctx, { intent: "symptoms", urgency: "LOW", summary: `${symptom.name} (${domain.name}) — general guidance`, doctorReviewRecommended: true, doctorSpeciality: speciality, redFlags: domain.warningSigns }),
  };
}
