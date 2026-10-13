import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/adapters/navigation";
import { AlertCircle } from "lucide-react";
import { useShell } from "@/features/shell/shell-context";
import type { ReportCallback } from "@/features/shell/types";
import type { Message } from "@/types/server";
import type { CardAction, ChatCard } from "@/lib/ai/types";
import { sendMessageAction, startConversationAction, type ChatAnswer } from "@/api/chat";
import { ChatCtx, type ChatActions } from "./chat-context";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { Thinking } from "./thinking";

export function ChatView({ conversationId: initialId, profileId, initialMessages, emptyState }: { conversationId: string | null; profileId: string; initialMessages: Message[]; emptyState?: React.ReactNode }) {
  const shell = useShell();
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; retry: string; answer?: ChatAnswer } | null>(null);
  const [activeProfile, setActiveProfile] = useState(profileId);
  const bottom = useRef<HTMLDivElement>(null);

  // Sync with fresh server data (router.refresh) without an effect.
  const [prevInitial, setPrevInitial] = useState(initialMessages);
  const [prevProfile, setPrevProfile] = useState(profileId);
  if (initialMessages !== prevInitial) {
    setPrevInitial(initialMessages);
    setMessages(initialMessages);
  }
  if (profileId !== prevProfile) {
    setPrevProfile(profileId);
    setActiveProfile(profileId);
  }
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const { registerConversation, unregisterConversation } = shell;
  useEffect(() => {
    if (!conversationId) return;
    registerConversation({
      id: conversationId,
      profileId: activeProfile,
      onProfileChanged: (m, newProfileId) => {
        setMessages(m as Message[]);
        setActiveProfile(newProfileId);
        router.refresh();
      },
    });
    return () => unregisterConversation(conversationId);
  }, [conversationId, activeProfile, registerConversation, unregisterConversation, router]);

  const send = useCallback(
    async (text: string, answer?: ChatAnswer) => {
      if (busy) return;
      setError(null);
      const optimistic: Message = { id: `tmp-${Date.now()}`, conversation_id: conversationId ?? "", profile_id: activeProfile, role: "user", content: text, cards: [], urgency: null, answer_id: null, created_at: new Date() };
      // Close any open question immediately so its buttons can't be tapped twice.
      setMessages((m) => [...m.map((x) => (x.cards.some((c) => c.type === "question" && c.status === "open") ? { ...x, cards: x.cards.map((c) => (c.type === "question" && c.status === "open" ? { ...c, status: "answered" as const, answerLabel: text } : c)) } : x)), optimistic]);
      setBusy(true);
      try {
        if (!conversationId) {
          const r = await startConversationAction(shell.selectedProfileId, text, answer);
          if (!r.ok) throw new Error(r.error);
          setConversationId(r.data!.conversationId);
          setMessages(r.data!.messages);
          window.history.replaceState(null, "", `/app/chat/${r.data!.conversationId}`);
          router.refresh();
        } else {
          const r = await sendMessageAction(conversationId, text, answer);
          if (!r.ok) throw new Error(r.error);
          setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), ...r.data!.messages]);
          router.refresh();
        }
      } catch (e) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setError({ text: e instanceof Error && e.message ? e.message : "I couldn't complete that health response safely.", retry: text, answer });
      } finally {
        setBusy(false);
      }
    },
    [busy, conversationId, activeProfile, shell.selectedProfileId, router],
  );

  const patchCard = useCallback((messageId: string, cardId: string, patch: Record<string, unknown>) => {
    setMessages((ms) => ms.map((m) => (m.id === messageId ? { ...m, cards: m.cards.map((c) => ("id" in c && c.id === cardId ? ({ ...c, ...patch } as ChatCard) : c)) } : m)));
  }, []);

  const reportShared: ReportCallback = useCallback(
    (r) => (r.purpose && ["skin", "injury", "eye", "throat", "nail", "scalp", "pet", "other", "photo"].includes(r.purpose) ? send("Shared a photo", { key: "photo_file", value: r.id }) : send(`Shared report: ${r.title}`, { key: "report_file", value: r.id })),
    [send],
  );
  const shareReport = useCallback(
    (via: "camera" | "upload" | "pick" | "menu", kind?: "photo") => {
      const pid = activeProfile;
      if (via === "camera") shell.openDialog({ kind: "camera", profileId: pid, onUploaded: reportShared });
      else if (via === "upload") shell.openDialog({ kind: "upload", profileId: pid, purpose: kind === "photo" ? "photo" : undefined, onUploaded: reportShared });
      else if (via === "pick") shell.openDialog({ kind: "pick_report", profileId: pid, onPicked: reportShared });
      else shell.openDialog({ kind: "attach", profileId: pid, onUploaded: reportShared, onPicked: reportShared });
    },
    [activeProfile, shell, reportShared],
  );
  const callMyDoctor = useCallback(() => {
    const phone = shell.myDoctor?.phone;
    if (phone) window.location.href = `tel:${phone.replace(/[^\d+]/g, "")}`;
    else shell.openDialog({ kind: "my_doctor" });
  }, [shell]);
  const findDoctor = useCallback((speciality: string) => send("Yes, find a doctor", { key: "find_doctor", value: speciality }), [send]);

  const runAction = useCallback(
    (a: CardAction, messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      const pid = msg?.profile_id ?? activeProfile;
      switch (a.kind) {
        case "link":
          if (a.href?.startsWith("http")) window.open(a.href, "_blank", "noopener");
          else if (a.href) router.push(a.href);
          break;
        case "upload_report":
          shareReport("menu");
          break;
        case "add_reading":
          shell.openDialog({ kind: "reading", profileId: pid, type: a.value });
          break;
        case "quick_reply":
          if (a.value) void send(a.value);
          break;
        case "call_my_doctor":
          callMyDoctor();
          break;
        case "find_doctor":
          findDoctor(a.value ?? "General Physician");
          break;
        default:
          if (a.href) router.push(a.href);
      }
    },
    [messages, activeProfile, router, shell, send, shareReport, callMyDoctor, findDoctor],
  );

  const ctx: ChatActions = useMemo(
    () => ({ conversationId, profileId: activeProfile, busy, send, replaceMessages: (m) => setMessages(m), patchCard, runAction, shareReport, callMyDoctor, findDoctor }),
    [conversationId, activeProfile, busy, send, patchCard, runAction, shareReport, callMyDoctor, findDoctor],
  );
  const empty = messages.length === 0;

  return (
    <ChatCtx.Provider value={ctx}>
      <div className="flex min-h-0 flex-1 flex-col">
        {empty && emptyState ? (
          emptyState
        ) : (
          <>
            <div className="mx-auto w-full max-w-[780px] flex-1 px-4 pb-6 pt-4 sm:px-6 sm:pt-6">
              <MessageList messages={messages} />
              {busy && (
                <div className="mt-5">
                  <Thinking />
                </div>
              )}
              {error && (
                <div role="alert" className="mt-5 flex flex-col gap-3 rounded-[14px] border border-danger/25 bg-danger-bg/60 p-4 sm:flex-row sm:items-center">
                  <AlertCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden />
                  <p className="flex-1 text-sm">{error.text}</p>
                  <button type="button" onClick={() => send(error.retry, error.answer)} className="h-10 rounded-[10px] border border-danger/30 bg-surface px-3 text-sm font-medium text-danger hover:bg-white">
                    Try again
                  </button>
                </div>
              )}
              <div ref={bottom} className="scroll-mb-[200px] lg:scroll-mb-[140px]" aria-hidden />
            </div>
            <div className="kw-composer-dock sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 bg-gradient-to-t from-page from-70% to-page/0 px-3 pb-2 pt-3 sm:px-6 lg:bottom-0 lg:pb-4">
              <div className="mx-auto max-w-[780px]">
                <Composer onSend={(t) => send(t)} onAttach={() => shareReport("menu")} busy={busy} />
                <p className="mt-1.5 text-center text-[11.5px] text-muted">Kinwell can make mistakes and isn&apos;t a substitute for medical care.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </ChatCtx.Provider>
  );
}
