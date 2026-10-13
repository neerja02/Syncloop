import "server-only";
import { randomUUID } from "node:crypto";
import type { Actor, Profile } from "@/types/domain";
import type { ConceptMatch } from "@/lib/integrations/terminology/clinical";
import type { Conversation, ConversationState, Message } from "@/lib/services/conversations";
import type { AgentResponse, ChatCard, Intent } from "../types";
import type { ClinicalRule } from "@/lib/clinical/rules";

/** Records exactly which information was used to generate an answer (for the audit/inspection view). */
export class SourceTracker {
  knowledgeDocuments = new Map<string, { document_id: string; title: string; version: number; doctor: string }>();
  chunks: { chunk_id: string; document_id: string; score: number; excerpt: string }[] = [];
  rules: { id: string; rule_key: string; version: number; source: string }[] = [];
  medications: { id?: string; name: string }[] = [];
  doctorInstructions: { id: string; type: string; version: number }[] = [];
  contextSections = new Set<string>();

  section(name: string) {
    this.contextSections.add(name);
  }
  rule(r: Pick<ClinicalRule, "id" | "rule_key" | "version" | "source">) {
    if (!this.rules.some((x) => x.id === r.id)) this.rules.push({ id: r.id, rule_key: r.rule_key, version: r.version, source: r.source });
  }
}

export interface AgentContext {
  actor: Actor;
  conversation: Conversation;
  profile: Profile & { age: number | null };
  familyProfiles: Profile[];
  familyId: string;
  countryCode: string;
  doctor: { id: string; name: string; acceptingReviews: boolean } | null;
  message: string;
  history: Message[];
  concepts: ConceptMatch[];
  state: ConversationState;
  intent: Intent;
  sources: SourceTracker;
  answerId: string;
}

export interface AgentResult {
  response: AgentResponse;
  /** Deterministic, fact-checked draft text. */
  text: string;
  cards: ChatCard[];
  state?: ConversationState;
  agent: string;
  /** True when the text must be shown exactly as written (emergency, unreadable values, etc.). */
  lockText?: boolean;
}

export const cardId = () => randomUUID().slice(0, 8);

export function baseResponse(ctx: Pick<AgentContext, "profile" | "intent">, partial: Partial<AgentResponse> = {}): AgentResponse {
  return {
    profileId: ctx.profile.id,
    intent: ctx.intent,
    urgency: "LOW",
    summary: "",
    clarifyingQuestions: [],
    possibleExplanations: [],
    recommendations: [],
    selfCare: [],
    redFlags: [],
    doctorReviewRecommended: false,
    doctorSpeciality: null,
    suggestedActions: [],
    medicalSources: [],
    doctorSources: [],
    recordUpdates: [],
    ...partial,
  };
}

/** "you" for the signed-in person's own profile, otherwise the profile name. */
export function subject(ctx: Pick<AgentContext, "profile">, forms: { you: string; other: (name: string) => string }) {
  return ctx.profile.relationship === "self" ? forms.you : forms.other(ctx.profile.display_name);
}
