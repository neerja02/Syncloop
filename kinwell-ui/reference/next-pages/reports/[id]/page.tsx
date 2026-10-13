import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, FileText, HelpCircle, Info, Pill } from "lucide-react";
import { requirePatient } from "@/lib/security/session";
import { familyProfiles } from "@/lib/server/selected-profile";
import { getReport, listFolders, resultHistory, labTestInfo, trendDirection } from "@/lib/services/reports";
import { getStorage } from "@/lib/integrations/storage";
import { ForbiddenError, NotFoundError } from "@/lib/security/access";
import { formatDate } from "@/lib/utils/format";
import { Badge, Card, SectionTitle } from "@/components/ui/misc";
import { AskAboutReport } from "@/features/reports/components/ask-about-report";
import { DOC_TYPE_LABEL, ReportStatusBadge } from "@/features/reports/components/report-status";
import { MedicationResultConfirm, OpenFileButtons, ReportSettings, ResultConfirm } from "@/features/reports/components/report-actions";

export const metadata = { title: "Report" };

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePatient();
  let data;
  try {
    data = await getReport(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  const { report, results, files } = data;
  const labs = results.filter((r) => r.field_type === "lab_value");
  const meds = results.filter((r) => r.field_type === "medication");
  const names = [...new Set(labs.map((l) => l.canonical_name).filter(Boolean))] as string[];
  const [history, profiles, folders] = await Promise.all([resultHistory(actor, report.profile_id, names), familyProfiles(actor.familyId), listFolders(actor, actor.familyId)]);
  const original = files.find((f) => f.variant === "original");
  const preview = files.find((f) => f.variant === "enhanced") ?? files.find((f) => f.variant === "thumbnail") ?? original;
  const previewUrl = preview ? await getStorage().signedUrl(preview.storage_key, { userId: actor.id, ttlSeconds: 900 }) : null;
  const isImage = preview?.mime_type.startsWith("image/");
  const isPdf = preview?.mime_type === "application/pdf";
  const questions: string[] = [];
  for (const l of labs) {
    if (l.flag === "high" || l.flag === "low") questions.push(`My ${l.canonical_name} was ${l.flag === "high" ? "above" : "below"} the printed range. What does that mean for me, and do I need a repeat test?`);
  }
  if (names.includes("HbA1c")) questions.push("What HbA1c target is right for me, and when should I test again?");
  if (meds.length) questions.push("Are these medicines and doses still right for me? Any side effects I should watch for?");
  if (!questions.length) questions.push("Is there anything in this report I should follow up on?");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted">
        <Link href="/reports" className="hover:text-ink">
          Reports
        </Link>
        {report.folder_name && (
          <>
            {" / "}
            <Link href={`/reports/folder/${report.folder_id}`} className="hover:text-ink">
              {report.folder_name}
            </Link>
          </>
        )}
      </nav>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight sm:text-2xl">{report.title}</h1>
          <p className="mt-1 text-[15px] text-muted">
            {report.profile_name} · {DOC_TYPE_LABEL[report.document_type] ?? "Document"} · {formatDate(report.report_date ?? report.created_at)}
            {report.lab_name ? ` · ${report.lab_name}` : ""}
            {report.doctor_name ? ` · ${report.doctor_name}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ReportStatusBadge status={report.status} />
            {report.extraction?.isMock && (
              <Badge tone="warning" icon={Info}>
                Demo OCR (development)
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AskAboutReport reportId={report.id} profileId={report.profile_id} title={report.title} />
          <ReportSettings report={{ id: report.id, title: report.title, profile_id: report.profile_id, folder_id: report.folder_id, report_date: report.report_date }} profiles={profiles} folders={folders} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-label="Document preview" className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            {previewUrl && isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={`Preview of ${report.title}`} className="max-h-[70vh] w-full bg-subtle object-contain" />
            ) : previewUrl && isPdf ? (
              <iframe src={previewUrl} title={`Preview of ${report.title}`} className="h-[60vh] w-full bg-subtle" />
            ) : (
              <div className="flex h-60 flex-col items-center justify-center gap-2 bg-subtle text-muted">
                <FileText className="h-10 w-10" aria-hidden />
                <span className="text-sm">{original ? "Preview not available for this file type" : "No file stored"}</span>
              </div>
            )}
          </Card>
          {original && <OpenFileButtons reportId={report.id} hasEnhanced={files.some((f) => f.variant === "enhanced")} />}
          {report.extraction?.enhancement?.length ? <p className="text-[12.5px] text-muted">Readability copy created ({report.extraction.enhancement.join(", ")}). Values are only read from what&apos;s on the page — the original is preserved unchanged.</p> : null}
          {report.quality && report.quality.issues.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning-bg/50 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span>Image quality: {report.quality.issues.join(", ")}. A clearer photo in good light, held flat, gives more reliable results.</span>
            </div>
          )}
        </section>

        <div className="space-y-6">
          {(report.status === "unreadable" || report.status === "failed") && (
            <div role="alert" className="rounded-[14px] border border-danger/30 bg-danger-bg/60 p-4">
              <p className="font-semibold text-danger">We couldn&apos;t reliably read this report.</p>
              <p className="mt-1 text-sm">Nothing has been added to the health record from it. Try uploading a clearer copy, or enter important values manually.</p>
            </div>
          )}

          <section aria-labelledby="summary">
            <SectionTitle id="summary">Summary</SectionTitle>
            <Card className="p-4 text-[15px] leading-relaxed">{report.summary ?? "Processing…"}</Card>
          </section>

          {labs.length > 0 && (
            <section aria-labelledby="results">
              <SectionTitle id="results">Extracted results</SectionTitle>
              <ul className="space-y-3">
                {labs.map((l) => {
                  const hist = l.canonical_name ? (history[l.canonical_name] ?? []) : [];
                  const others = hist.filter((h) => h.report_id !== report.id);
                  const series = [...(l.value != null ? [l.value] : []), ...others.map((h) => h.value)];
                  const trend = l.canonical_name && l.value != null ? trendDirection(l.canonical_name, series) : null;
                  const info = labTestInfo(l.canonical_name);
                  const TrendIcon = trend?.direction === "improving" ? ArrowDownRight : trend?.direction === "worsening" ? ArrowUpRight : ArrowRight;
                  return (
                    <li key={l.id}>
                      <Card className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{l.canonical_name ?? l.test_name}</p>
                            {info && <p className="text-[13px] text-muted">{info.measures}</p>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {l.status === "unreadable" ? <Badge tone="warning">Couldn&apos;t read</Badge> : l.status === "needs_confirmation" ? <Badge tone="warning">Please confirm</Badge> : null}
                            {l.flag === "high" && <Badge tone="warning">Above printed range</Badge>}
                            {l.flag === "low" && <Badge tone="warning">Below printed range</Badge>}
                            {l.flag === "normal" && <Badge tone="success">Within printed range</Badge>}
                          </div>
                        </div>
                        <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
                          <div>
                            <dt className="text-[12px] uppercase tracking-wide text-muted">Latest</dt>
                            <dd className="tabular text-xl font-semibold">{l.value != null ? `${l.value}${l.unit === "%" ? "%" : ""}` : "—"}</dd>
                            {l.unit !== "%" && l.value != null && <dd className="text-[12px] text-muted">{l.unit}</dd>}
                          </div>
                          <div>
                            <dt className="text-[12px] uppercase tracking-wide text-muted">Previous</dt>
                            <dd className="tabular text-lg">{others[0] ? `${others[0].value}${l.unit === "%" ? "%" : ""}` : "—"}</dd>
                            {others[0] && <dd className="text-[12px] text-muted">{formatDate(others[0].observed_at)}</dd>}
                          </div>
                          <div>
                            <dt className="text-[12px] uppercase tracking-wide text-muted">Earlier</dt>
                            <dd className="tabular text-lg">{others[1] ? `${others[1].value}${l.unit === "%" ? "%" : ""}` : "—"}</dd>
                            {others[1] && <dd className="text-[12px] text-muted">{formatDate(others[1].observed_at)}</dd>}
                          </div>
                        </dl>
                        {trend && trend.direction !== "insufficient" && (
                          <p className="mt-2 flex items-center gap-1.5 text-sm">
                            <TrendIcon className="h-4 w-4 text-primary-ink" aria-hidden />
                            <span className="font-medium">Trend: {trend.direction === "improving" ? "Improving" : trend.direction === "worsening" ? "Rising" : "Stable"}</span>
                            <span className="text-muted">— {trend.label.toLowerCase()}</span>
                          </p>
                        )}
                        {l.reference_range && <p className="mt-1 text-[12.5px] text-muted">Reference range printed on report: {l.reference_range} {l.unit}</p>}
                        {(l.status === "unreadable" || l.status === "needs_confirmation") && <ResultConfirm id={l.id} valueText={l.value_text} value={l.value} unit={l.unit} canonical={l.canonical_name} unreadable={l.status === "unreadable"} />}
                        <p className="mt-2 text-[11.5px] text-muted">
                          Read from page {l.page_number ?? 1} · confidence {Math.round(l.confidence * 100)}% · “{l.raw_text}”
                        </p>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {meds.length > 0 && (
            <section aria-labelledby="meds">
              <SectionTitle id="meds">Medicines on this document</SectionTitle>
              <Card className="divide-y divide-line">
                {meds.map((m) => (
                  <div key={m.id} className="p-4">
                    <p className="flex items-center gap-2 font-medium">
                      <Pill className="h-4 w-4 text-primary-ink" aria-hidden />
                      {m.status === "confirmed" ? m.canonical_name : m.test_name}
                      {m.status === "confirmed" && <Badge tone="success">Confirmed</Badge>}
                      {m.status === "rejected" && <Badge tone="neutral">Ignored</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{m.value_text}</p>
                    {m.status === "needs_confirmation" || m.status === "unreadable" ? <MedicationResultConfirm id={m.id} original={m.test_name} suggestion={m.canonical_name} alternatives={[]} /> : null}
                  </div>
                ))}
              </Card>
            </section>
          )}

          <section aria-labelledby="questions">
            <SectionTitle id="questions">Questions you may want to ask your doctor</SectionTitle>
            <Card className="p-4">
              <ul className="space-y-2">
                {questions.map((q) => (
                  <li key={q} className="flex gap-2 text-[15px]">
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary-ink" aria-hidden />
                    {q}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
          <p className="text-[12.5px] text-muted">Explanations are general information. Reference ranges vary between labs; your doctor can interpret results in context.</p>
        </div>
      </div>
    </div>
  );
}
