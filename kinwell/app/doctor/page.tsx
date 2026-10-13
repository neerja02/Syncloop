import Link from "next/link";
import { AlertTriangle, BookOpen, CalendarDays, ClipboardCheck, FileText, MessageSquare, Users } from "lucide-react";
import { requireDoctor } from "@/lib/security/session";
import { doctorDashboard } from "@/lib/services/doctor";
import { knowledgeStats } from "@/lib/services/knowledge";
import { formatDateTime, relativeDay } from "@/lib/utils/format";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui/misc";

export const metadata = { title: "Doctor dashboard" };

const PRIORITY_TONE = { urgent: "danger", soon: "warning", routine: "neutral" } as const;

export default async function DoctorDashboard() {
  const actor = await requireDoctor();
  const [d, k] = await Promise.all([doctorDashboard(actor), knowledgeStats(actor.doctorId)]);
  const stats = [
    { label: "Assigned families", value: d.counts.families, icon: Users, href: "/doctor/families" },
    { label: "Patients", value: d.counts.patients, icon: Users, href: "/doctor/families" },
    { label: "Cases to review", value: d.counts.pending_reviews, icon: ClipboardCheck, href: "/doctor/reviews" },
    { label: "Unread messages", value: d.counts.unread, icon: MessageSquare, href: "/doctor/messages" },
    { label: "Upcoming appointments", value: d.counts.upcoming, icon: CalendarDays, href: "/doctor/appointments" },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Good to see you" description="Here's what needs your attention across your families." />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="block rounded-[14px] border border-line bg-surface p-4 hover:border-primary/30">
              <s.icon className="h-5 w-5 text-primary-ink" aria-hidden />
              <p className="tabular mt-2 text-2xl font-semibold">{s.value}</p>
              <p className="text-[13px] text-muted">{s.label}</p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="cases">
          <SectionTitle id="cases" action={<Link href="/doctor/reviews" className="text-sm font-medium text-primary-ink hover:underline">All reviews</Link>}>
            Cases requiring review
          </SectionTitle>
          <Card className="divide-y divide-line">
            {d.reviews.length === 0 && <p className="p-4 text-sm text-muted">No open cases. 🎉</p>}
            {d.reviews.map((r) => (
              <Link key={r.id} href={`/doctor/reviews/${r.id}`} className="block p-4 hover:bg-subtle">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {r.profile_name} <span className="font-normal text-muted">· {r.family_name}</span>
                  </span>
                  <Badge tone={PRIORITY_TONE[r.priority as keyof typeof PRIORITY_TONE] ?? "neutral"}>{r.priority}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{r.question}</p>
                <p className="mt-1 text-[12px] text-muted">{formatDateTime(r.created_at)}</p>
              </Link>
            ))}
          </Card>
        </section>
        <section aria-labelledby="escalations">
          <SectionTitle id="escalations">AI escalations</SectionTitle>
          <Card className="divide-y divide-line">
            {d.escalations.length === 0 && <p className="p-4 text-sm text-muted">No high-urgency AI responses recently.</p>}
            {d.escalations.map((e) => (
              <Link key={e.answer_id} href={`/doctor/patients/${e.profile_id}#audit`} className="flex items-center gap-3 p-4 hover:bg-subtle">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${e.urgency === "EMERGENCY" ? "text-danger" : "text-warning"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{e.profile_name}</span>
                  <span className="text-[13px] text-muted">
                    {e.agent} · {formatDateTime(e.created_at)}
                  </span>
                </span>
                <Badge tone={e.urgency === "EMERGENCY" ? "danger" : "warning"}>{e.urgency}</Badge>
              </Link>
            ))}
          </Card>
        </section>
        <section aria-labelledby="recent-reports">
          <SectionTitle id="recent-reports">Recently uploaded reports</SectionTitle>
          <Card className="divide-y divide-line">
            {d.reports.length === 0 && <p className="p-4 text-sm text-muted">No reports yet.</p>}
            {d.reports.map((r) => (
              <Link key={r.id} href={`/doctor/reports/${r.id}`} className="flex items-center gap-3 p-4 hover:bg-subtle">
                <FileText className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="text-[13px] text-muted">
                    {r.profile_name} · {r.family_name} · {relativeDay(r.created_at)}
                  </span>
                </span>
                {r.doctor_reviewed_at ? <Badge tone="success">Reviewed</Badge> : <Badge tone="info">New</Badge>}
              </Link>
            ))}
          </Card>
        </section>
        <section aria-labelledby="upcoming">
          <SectionTitle id="upcoming">Upcoming appointments</SectionTitle>
          <Card className="divide-y divide-line">
            {d.appointments.length === 0 && <p className="p-4 text-sm text-muted">Nothing scheduled.</p>}
            {d.appointments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-4">
                <span>
                  <span className="block font-medium">{a.profile_name}</span>
                  <span className="text-[13px] text-muted">
                    {formatDateTime(a.starts_at)} · {a.appointment_type.replace("_", " ")}
                  </span>
                </span>
                <Badge tone={a.status === "confirmed" ? "success" : "info"}>{a.status}</Badge>
              </div>
            ))}
          </Card>
        </section>
        <section aria-labelledby="unread">
          <SectionTitle id="unread">Unread family questions</SectionTitle>
          <Card className="divide-y divide-line">
            {d.messages.length === 0 && <p className="p-4 text-sm text-muted">You&apos;re all caught up.</p>}
            {d.messages.map((m) => (
              <Link key={m.id} href={`/doctor/messages?family=${m.family_id}`} className="block p-4 hover:bg-subtle">
                <span className="font-medium">{m.family_name}</span>
                <p className="line-clamp-2 text-sm text-muted">{m.body}</p>
              </Link>
            ))}
          </Card>
        </section>
        <section aria-labelledby="kb">
          <SectionTitle id="kb" action={<Link href="/doctor/knowledge" className="text-sm font-medium text-primary-ink hover:underline">Manage</Link>}>
            Knowledge-base status
          </SectionTitle>
          <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {[
              ["Active documents", k.approved],
              ["Awaiting approval", k.pending],
              ["Failed", k.failed],
              ["Searchable passages", k.chunks],
            ].map(([l, v]) => (
              <div key={l as string}>
                <p className="tabular text-2xl font-semibold">{v}</p>
                <p className="text-[13px] text-muted">{l}</p>
              </div>
            ))}
            <p className="col-span-full flex items-center gap-2 text-[13px] text-muted">
              <BookOpen className="h-4 w-4" aria-hidden /> Only approved, active documents are used to answer your patients.
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
