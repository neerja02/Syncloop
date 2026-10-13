/**
 * A tiny scripted backend so the demo works with no server. It answers the chat with Kinwell's real card types:
 * any message asks where it hurts (with the body map); tapping a spot returns a care level, a summary, possible
 * causes, self-care and a specialist suggestion. Replace with `setTransport` pointing at your API.
 */
import type { ChatCard } from "@/lib/ai/types";
import type { Message } from "@/types/server";
import { setTransport } from "@/api/client";
import { DEMO_PROFILE_ID } from "./sample-data";

let n = 0;
const id = () => `demo-${++n}`;
const msg = (role: Message["role"], content: string, cards: ChatCard[] = []): Message => ({
  id: id(),
  conversation_id: "demo-conversation",
  profile_id: DEMO_PROFILE_ID,
  role,
  content,
  cards,
  urgency: null,
  answer_id: null,
  created_at: new Date(),
});

const whereQuestion = (): Message =>
  msg("assistant", "I'm sorry you're dealing with this. Where exactly is the pain?", [
    {
      id: id(),
      type: "question",
      key: "pain_location",
      style: "body",
      status: "open",
      options: [
        { label: "Head", value: "head" },
        { label: "Chest", value: "chest" },
        { label: "Upper stomach", value: "upper_abdomen" },
        { label: "Back", value: "back" },
        { label: "Knee", value: "knee" },
        { label: "Ankle or foot", value: "ankle_foot" },
        { label: "Somewhere else / not sure", value: "unsure" },
      ],
    },
  ]);

const outcome = (where: string): Message =>
  msg("assistant", "Based on what you've told me, this doesn't appear to show the emergency signs I checked for, and it sounds like something that can usually be managed at home for now.", [
    { id: id(), type: "care_level", level: "monitor", audience: "human" },
    { id: id(), type: "info", tone: "info", title: "What I've understood", body: `• Pain — ${where}\n• Location chosen on the body map\n• No emergency warning signs reported` },
    {
      id: id(),
      type: "info",
      tone: "info",
      title: "What this could be",
      body: "There are several possible causes. Based on what you've told me, they include:\n• Irritation from overuse\n• A minor strain\n\nThis isn't a diagnosis — a clinician may need to examine you to tell these apart.",
    },
    { id: id(), type: "info", tone: "success", title: "What you can do now", body: "• Ease off the activities that bring it on, but keep moving gently\n• A cold pack wrapped in a cloth for 15 minutes can help" },
    { id: id(), type: "info", tone: "warning", title: "Get urgent help if you notice", body: "• You can't put weight on it\n• It becomes hot, red and swollen, or you get a fever" },
    { id: id(), type: "doctor_recommendation", speciality: "Physiotherapist", reason: "A Physiotherapist can examine it and give a plan if it doesn't settle.", timing: "routine", profileId: DEMO_PROFILE_ID, status: "open" },
  ]);

function reply(text: string, answer?: { key: string; value: string }) {
  const user = msg("user", text);
  if (answer?.key === "pain_location") return [user, outcome(text)];
  return [user, whereQuestion()];
}

export function installMockApi() {
  setTransport(async (name, args) => {
    await new Promise((r) => setTimeout(r, 450));
    if (name === "startConversationAction") {
      const [, text, answer] = args as [string, string, { key: string; value: string } | undefined];
      return { ok: true, data: { conversationId: "demo-conversation", messages: reply(text, answer) } };
    }
    if (name === "sendMessageAction") {
      const [, text, answer] = args as [string, string, { key: string; value: string } | undefined];
      return { ok: true, data: { messages: reply(text, answer) } };
    }
    return { ok: false, error: "Not available in this demo." };
  });
}
