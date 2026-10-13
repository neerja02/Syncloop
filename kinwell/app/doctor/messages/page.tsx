import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { requireDoctor } from "@/lib/security/session";
import { doctorMessageThreads, listMessages } from "@/lib/services/doctor";
import { formatDateTime } from "@/lib/utils/format";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { DoctorMessageForm } from "@/features/doctor/components/doctor-forms";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "Messages" };

export default async function DoctorMessages({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const { family } = await searchParams;
  const actor = await requireDoctor();
  const threads = await doctorMessageThreads(actor);
  const active = threads.find((t) => t.family_id === family) ?? threads[0];
  const messages = active ? await listMessages(actor, active.family_id) : [];
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Messages" description="Conversations with your families." />
      {threads.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No families yet" />
      ) : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <Card className="divide-y divide-line self-start">
            {threads.map((t) => (
              <Link key={t.family_id} href={`/doctor/messages?family=${t.family_id}`} className={cn("block p-3.5 hover:bg-subtle", active?.family_id === t.family_id && "bg-accent-light/40")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t.family_name}</span>
                  {t.unread > 0 && <span className="tabular rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">{t.unread}</span>}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{t.last_body ?? "No messages yet"}</p>
              </Link>
            ))}
          </Card>
          {active && (
            <Card className="flex min-h-[460px] flex-col">
              <div className="border-b border-line px-4 py-3 font-semibold">{active.family_name}</div>
              <ol className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 && <li className="text-sm text-muted">No messages yet.</li>}
                {messages.map((m) => (
                  <li key={m.id} className={cn("flex", m.sender_role === "doctor" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[15px]", m.sender_role === "doctor" ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-subtle")}>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className={cn("mt-1 text-[11px]", m.sender_role === "doctor" ? "text-white/75" : "text-muted")}>
                        {m.sender_role === "family" ? m.sender_name : "You"}
                        {m.profile_name ? ` · about ${m.profile_name}` : ""} · {formatDateTime(m.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <DoctorMessageForm familyId={active.family_id} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
