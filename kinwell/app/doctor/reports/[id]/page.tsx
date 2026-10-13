import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDoctor } from "@/lib/security/session";
import { getReport } from "@/lib/services/reports";
import { ForbiddenError, NotFoundError } from "@/lib/security/access";
import { formatDate } from "@/lib/utils/format";
import { Badge, Card, SectionTitle } from "@/components/ui/misc";
import { MarkReviewed } from "@/features/doctor/components/doctor-forms";

export const metadata = { title: "Report" };

export default async function DoctorReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireDoctor();
  let data;
  try {
    data = await getReport(actor, id);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) notFound();
    throw e;
  }
  const { report, results } = data;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href={`/doctor/patients/${report.profile_id}`} className="text-[13px] text-muted hover:text-ink">
        ← {report.profile_name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{report.title}</h1>
      <p className="text-muted">
        {report.profile_name} · {formatDate(report.report_date ?? report.created_at)} · {report.lab_name ?? "Unknown source"}
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-4 text-[15px]">{report.summary}</Card>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-[12.5px] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Field</th>
                  <th className="px-4 py-2.5 font-medium">Value</th>
                  <th className="px-4 py-2.5 font-medium">Range</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5">
                      {r.canonical_name ?? r.test_name}
                      <span className="block text-[11.5px] text-muted">“{r.raw_text}” · {Math.round(r.confidence * 100)}%</span>
                    </td>
                    <td className="tabular px-4 py-2.5 font-medium">{r.value != null ? `${r.value} ${r.unit ?? ""}` : r.field_type === "medication" ? r.value_text : <span className="text-warning">unreadable “{r.value_text}”</span>}</td>
                    <td className="px-4 py-2.5 text-muted">{r.reference_range ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={r.status === "confirmed" ? "success" : "warning"} icon={false}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <Card className="self-start p-5">
          <SectionTitle>{report.doctor_reviewed_at ? `Reviewed ${formatDate(report.doctor_reviewed_at)}` : "Review this report"}</SectionTitle>
          <MarkReviewed reportId={report.id} notes={report.doctor_notes} reviewed={!!report.doctor_reviewed_at} />
        </Card>
      </div>
    </div>
  );
}
