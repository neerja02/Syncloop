import type { Message } from "@/types/server";
import { call, type ActionResult } from "./client";

/** A tapped answer to a guided question (key = question key, value = option value). */
export interface ChatAnswer {
  key: string;
  value: string;
}

/** The audit record behind an AI answer ("Where this answer came from"). */
export interface AnswerSources {
  agent: string;
  model: string;
  provider: string;
  knowledge_documents_used: unknown[];
  retrieved_chunks: unknown[];
  clinical_rules_used: unknown[];
  medications_referenced: unknown[];
  doctor_instructions_used: unknown[];
  context_sections: string[];
  created_at: string;
}

/** Creates a conversation for a profile and runs the first turn. */
export const startConversationAction = (profileId: string, firstMessage: string, answer?: ChatAnswer) =>
  call<ActionResult<{ conversationId: string; messages: Message[] }>>("startConversationAction", profileId, firstMessage, answer);
/** Sends typed text or a tapped answer; returns the user's message and the assistant's reply. */
export const sendMessageAction = (conversationId: string, text: string, answer?: ChatAnswer) =>
  call<ActionResult<{ messages: Message[] }>>("sendMessageAction", conversationId, text, answer);
export const resolveProfileSwitchAction = (conversationId: string, messageId: string, cardId: string, decision: "switch" | "keep") =>
  call<ActionResult<Message[]>>("resolveProfileSwitchAction", conversationId, messageId, cardId, decision);
export const changeConversationProfileAction = (conversationId: string, profileId: string) =>
  call<ActionResult<Message[]>>("changeConversationProfileAction", conversationId, profileId);
/** "Save this to the health record?" — returns the card's new status ("saved" | "dismissed"). */
export const confirmRecordProposalAction = (messageId: string, cardId: string, decision: "save" | "dismiss") =>
  call<ActionResult<string>>("confirmRecordProposalAction", messageId, cardId, decision);
export const updateCardStatusAction = (messageId: string, cardId: string, patch: Record<string, unknown>) =>
  call<ActionResult<unknown>>("updateCardStatusAction", messageId, cardId, patch);
export const renameConversationAction = (id: string, title: string) => call<ActionResult>("renameConversationAction", id, title);
export const deleteConversationAction = (id: string) => call<ActionResult>("deleteConversationAction", id);
export const answerSourcesAction = (answerId: string) => call<ActionResult<AnswerSources>>("answerSourcesAction", answerId);
