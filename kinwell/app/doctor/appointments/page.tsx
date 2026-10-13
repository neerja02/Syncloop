import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { requireDoctor } from "@/lib/security/session";
import { listDoctorAppointments } from "@/lib/services/appointments";
import { formatDateTime } from "@/lib/utils/format";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/misc";
import { AppointmentStatusButtons } from "@/features/doctor/components/doctor-forms";

export const metadata = { title: "Appointments" };

export default async function DoctorAppointments() {
  const actor = await requireDoctor();
  const appts = await listDoctorAppointments(actor);
  const upcoming = appts.filter((a) => ["requested", "confirmed"].includes(a.status));
  const past = appts.filter((a) => !upcoming.includes(a)).reverse();
  const renderList = (items: typeof appts) => (
    <Card className="divide-y divide-line">
      {items.map((a) => (
        <div key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/doctor/patients/${a.profile_id}`} className="font-medium hover:underline">
                {a.profile_name}
              </Link>
              <span className="text-sm text-muted">· {a.family_name}</span>
              <Badge tone={a.status === "confirmed" ? "success" : a.status === "requested" ? "info" : a.status === "cancelled" ? "danger" : "neutral"}>{a.status}</Badge>
            </div>
            <p className="text-sm text-muted">
              {formatDateTime(a.starts_at)} · {a.appointment_type.replace("_", " ")}
              {a.notes ? ` · ${a.notes}` : ""}
            </p>
          </div>
          <AppointmentStatusButtons id={a.id} status={a.status} />
        </div>
      ))}
    </Card>
  );
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Appointments" description="Confirm requests from your families and keep track of visits." />
      <SectionTitle>Requested &amp; upcoming</SectionTitle>
      {upcoming.length ? renderList(upcoming) : <EmptyState icon={CalendarDays} title="No upcoming appointments" />}
      {past.length > 0 && (
        <div className="mt-8">
          <SectionTitle>Past &amp; cancelled</SectionTitle>
          {renderList(past)}
        </div>
      )}
    </div>
  );
}
