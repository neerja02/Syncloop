"use client";
import { createContext, useContext } from "react";
import type { Message } from "@/lib/services/conversations";
import type { CardAction } from "@/lib/ai/types";
import type { ChatAnswer } from "../actions";

export interface ChatActions {
  conversationId: string | null;
  profileId: string;
  busy: boolean;
  /** Sends typed text, or a tapped answer (shown as `text` in the user's bubble). */
  send: (text: string, answer?: ChatAnswer) => void;
  replaceMessages: (m: Message[]) => void;
  patchCard: (messageId: string, cardId: string, patch: Record<string, unknown>) => void;
  runAction: (a: CardAction, messageId: string) => void;
  /** Opens the photo / upload / saved-report choices and posts the chosen report into the chat. */
  /** `photo` asks for a photo of a symptom rather than a report document. */
  shareReport: (via: "camera" | "upload" | "pick" | "menu", kind?: "photo") => void;
  callMyDoctor: () => void;
  findDoctor: (speciality: string) => void;
}

export const ChatCtx = createContext<ChatActions | null>(null);
export function useChat() {
  const c = useContext(ChatCtx);
  if (!c) throw new Error("useChat outside ChatCtx");
  return c;
}
