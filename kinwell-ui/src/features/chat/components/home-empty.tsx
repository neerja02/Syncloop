import { useSyncExternalStore } from "react";
import Link from "@/adapters/link";
import { CalendarCheck, ChevronRight, FileSearch, FlaskConical, MessageCircleQuestion, Stethoscope } from "lucide-react";
import { useShell } from "@/features/shell/shell-context";
import { Composer } from "./composer";
import { useChat } from "./chat-context";

const QUICK = [
  { label: "Analyse a Report", flow: "report", icon: FileSearch },
  { label: "Check a Symptom", flow: "symptom", icon: Stethoscope },
  { label: "Understand a Test Result", flow: "test_result", icon: FlaskConical },
  { label: "Ask a Health Question", flow: "question", icon: MessageCircleQuestion },
] as const;

function greetingNow() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** The first screen: a greeting, the composer and four ways to start. Nothing else competes for attention. */
export function HomeEmpty({ name, checkIns = [] }: { name: string; checkIns?: { id: string; conversationId: string; text: string }[] }) {
  const shell = useShell();
  const chat = useChat();
  const greeting = useSyncExternalStore(
    () => () => {},
    greetingNow,
    () => "Hello",
  );
  const subject = shell.profiles.find((p) => p.id === shell.selectedProfileId);
  const forOther = subject && subject.relationship !== "self";
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col justify-center px-4 pb-8 pt-6 sm:px-6">
      <div className="kw-in">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
          {greeting}, {name}.
        </h1>
        <p className="mt-1 text-[22px] font-medium leading-snug text-primary-dark sm:text-[26px]">{forOther ? `How is ${subject.display_name} feeling today?` : "How are you feeling today?"}</p>
        <p className="mt-2 text-[15px] text-muted">Tell me what&apos;s bothering you, or choose an option below.</p>
      </div>
      {checkIns.length > 0 && (
        <ul className="mt-5 space-y-2" aria-label="Check-ins">
          {checkIns.map((c) => (
            <li key={c.id}>
              <Link href={`/app/chat/${c.conversationId}`} className="flex min-h-12 items-center gap-3 rounded-2xl border border-primary/20 bg-accent-light/70 px-4 py-2.5 text-[15px] hover:bg-accent-light">
                <CalendarCheck className="h-5 w-5 shrink-0 text-primary-dark" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium uppercase tracking-wide text-primary-ink">Check-in</span>
                  <span className="block font-medium">{c.text}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        <Composer onSend={(t) => chat.send(t)} onAttach={() => chat.shareReport("menu")} busy={chat.busy} large />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5" role="group" aria-label="Ways to start">
        {QUICK.map((q) => (
          <button
            key={q.flow}
            type="button"
            disabled={chat.busy}
            onClick={() => chat.send(q.label, { key: "start", value: q.flow })}
            className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left text-[15px] font-medium leading-snug text-ink transition-colors hover:border-primary/40 hover:bg-accent-light/50 disabled:opacity-60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-light text-primary-ink">
              <q.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            {q.label}
          </button>
        ))}
      </div>
      <p className="mt-6 text-center text-[12px] text-muted">Kinwell gives health information, not a diagnosis. In an emergency, call your local emergency number.</p>
    </div>
  );
}
