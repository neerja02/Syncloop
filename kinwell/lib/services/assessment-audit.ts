import "server-only";
import { getDb } from "@/lib/database/client";

/** Bumped whenever the guided engines' questions or rules change, so each assessment can be traced. */
export const ENGINE_VERSION = "guided-2026.10-b";

/**
 * Records a completed or escalated assessment: what was asked and answered, which warning signs fired, the
 * care level and specialist suggested, and the rule versions used. Never blocks the conversation.
 */
export async function recordAssessment(input: {
  familyId: string;
  profileId: string | null;
  conversationId: string;
  flow: string;
  complaint: string | null;
  answers: Record<string, string>;
  redFlags: string[];
  careLevel: string;
  speciality: string | null;
  possibilities: string[];
  ruleVersions: { rule_key: string; version: number }[];
}) {
  try {
    const db = await getDb();
    await db.query(
      `insert into assessment_audit_log(family_id, profile_id, conversation_id, flow, complaint, answers, red_flags, care_level, speciality, possibilities, rule_versions, engine_version)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12)`,
      [input.familyId, input.profileId, input.conversationId, input.flow, input.complaint, JSON.stringify(input.answers), input.redFlags, input.careLevel, input.speciality, input.possibilities, JSON.stringify(input.ruleVersions), ENGINE_VERSION],
    );
  } catch (e) {
    console.error("[audit] could not record assessment", e);
  }
}
