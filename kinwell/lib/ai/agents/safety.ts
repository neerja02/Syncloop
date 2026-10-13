import "server-only";
import { getDb } from "@/lib/database/client";
import { getEmergencyConfig } from "@/lib/clinical/emergency-config";
import type { TriageResult } from "@/lib/clinical/triage";
import { baseResponse, cardId, type AgentContext, type AgentResult } from "./context";
import type { ChatCard } from "../types";

/**
 * Emergency interruption. Wording is fixed (lockText) and phone numbers come only from the verified
 * country configuration — never from model output.
 */
export async function emergencyResult(ctx: AgentContext, triage: TriageResult): Promise<AgentResult> {
  const cfg = getEmergencyConfig(ctx.countryCode);
  const db = await getDb();
  const contact = (await db.query<{ name: string; phone: string }>("select name, phone from emergency_contacts where profile_id = $1 order by is_primary desc limit 1", [ctx.profile.id])).rows[0] ?? null;
  const reasons = triage.matchedRules.map((m) => m.label);
  const card: ChatCard = {
    id: cardId(),
    type: "emergency",
    title: "Urgent medical help may be needed",
    message: triage.crisis
      ? "You deserve support right now. If you might act on these thoughts or are in danger, please call emergency services or a crisis line now. If you can, stay with someone you trust."
      : "Based on what you've described, prompt medical assessment may be necessary.",
    reasons,
    countryName: cfg.countryName,
    emergencyNumber: cfg.emergencyNumber,
    ambulanceNumber: cfg.ambulanceNumber ?? null,
    crisisLine: triage.crisis ? cfg.crisisLine ?? null : null,
    emergencyContact: contact,
    profileId: ctx.profile.id,
    profileName: ctx.profile.display_name,
  };
  const text = triage.crisis
    ? `I'm really glad you told me. You don't have to handle this alone. Please contact ${cfg.crisisLine ? `${cfg.crisisLine.label} on ${cfg.crisisLine.number}` : "a crisis line"} or emergency services on ${cfg.emergencyNumber} now, or ask someone nearby to stay with you.`
    : `This could need urgent medical attention. Please call emergency services (${cfg.emergencyNumber}${cfg.ambulanceNumber ? `, ambulance ${cfg.ambulanceNumber}` : ""}) or go to the nearest emergency department now. Don't drive yourself if you feel unwell.`;
  return {
    agent: "TriageSafetyEngine",
    text,
    cards: [card],
    lockText: true,
    state: { ...ctx.state, pending: null, symptomFlow: null, lastIntent: "emergency" },
    response: baseResponse(ctx, {
      intent: "emergency",
      urgency: "EMERGENCY",
      summary: `Possible emergency: ${reasons.join("; ")}`,
      redFlags: triage.redFlags,
      doctorReviewRecommended: true,
      suggestedActions: ["call_emergency", "call_emergency_contact", "find_emergency_care", "share_summary"],
      medicalSources: triage.matchedRules.map((m) => `Triage rule ${m.rule_key} v${m.version}`),
    }),
  };
}
