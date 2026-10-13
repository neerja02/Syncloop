import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDoctor } from "@/lib/security/session";
import { getReview } from "@/lib/services/reviews";
import { getConversation } from "@/lib/services/conversations";
import { getDb } from "@/lib/database/client";
import { ForbiddenError, NotFoundError } from "@/lib/security/access";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { Badge, Card, SectionTitle } from "@/components/ui/misc";
import { ReviewActions } from "@/features/doctor/components/doctor-forms";

export const metadata = { title: "Review" };

export default async function DoctorReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireDoctor();
  let review;
  try {
    review = await getReview(actor, id);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) notFound();
    throw e;
  }
  const convo = review.conversation_id ? await getConversation(actor, review.conversation_id).catch(() => null) : null;
  const db = await getDb();
  const audit = review.answer_id
    ? (await db.query<{ agent: string; provider: string; model: string; knowledge_documents_used: { title: string; version: number }[]; retrieved_chunks: { excerpt: string; score: number }[]; clinical_rules_used: { rule_key: string; version: number; source: string }[]; context_sections: string[]; doctor_instructions_used: { type: string; version: number }[] }>("select * from agent_audit_logs where answer_id = $1", [review.answer_id])).rows[0]
    : null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/doctor/reviews" className="text-[13px] text-muted hover:text-ink">
        ← Reviews
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {review.profile_name} <span className="font-normal text-muted">· {review.family_name}</span>
        </h1>
        <Badge tone={review.priority === "urgent" ? "danger" : review.priority === "soon" ? "warning" : "neutral"}>{review.priority}</Badge>
        <Badge tone="info" icon={false}>
          {review.status.replace(/_/g, " ")}
        </Badge>
        <Link href={`/doctor/patients/${review.profile_id}`} className="ml-auto text-sm font-medium text-primary-ink hover:underline">
          Open patient record
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="p-5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Question from the family · {formatDateTime(review.created_at)}</p>
            <p className="mt-2 whitespace-pre-line text-[16px]">{review.question}</p>
            <p className="mt-3 text-sm text-muted">Summary: {review.summary}</p>
          </Card>
          {review.ai_response && (
            <Card className="p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Assistant&apos;s answer the patient saw</p>
              <p className="mt-2 whitespace-pre-line text-[15px]">{review.ai_response}</p>
            </Card>
          )}
          {audit && (
            <Card className="p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">What information was used to generate this answer?</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="font-medium">Agent / model</dt>
                  <dd className="text-muted">
                    {audit.agent} · {audit.provider}/{audit.model}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Your instructions</dt>
                  <dd className="text-muted">{audit.doctor_instructions_used.map((d) => `${d.type} v${d.version}`).join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt className="font-medium">Your knowledge documents</dt>
                  <dd className="text-muted">{audit.knowledge_documents_used.map((d) => `${d.title} (v${d.version})`).join("; ") || "None"}</dd>
                </div>
                {audit.retrieved_chunks.length > 0 && (
                  <div>
                    <dt className="font-medium">Retrieved passages</dt>
                    <dd>
                      <ul className="mt-1 space-y-1">
                        {audit.retrieved_chunks.map((c, i) => (
                          <li key={i} className="rounded-lg bg-page p-2 text-[13px] text-muted">
                            “{c.excerpt}…” <span className="text-[11px]">(score {c.score})</span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="font-medium">Clinical rules</dt>
                  <dd className="text-muted">{audit.clinical_rules_used.map((r) => `${r.rule_key} v${r.version}`).join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt className="font-medium">Patient record sections loaded</dt>
                  <dd className="text-muted">{audit.context_sections.join(", ") || "None"}</dd>
                </div>
              </dl>
            </Card>
          )}
          {convo && (
            <Card className="p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Conversation</p>
              <ol className="mt-3 space-y-3">
                {convo.messages
                  .filter((m) => m.role !== "system")
                  .slice(-12)
                  .map((m) => (
                    <li key={m.id} className={`rounded-xl p-3 text-sm ${m.role === "user" ? "bg-subtle" : m.role === "doctor" ? "border border-primary/20 bg-accent-light/40" : "border border-line"}`}>
                      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{m.role === "user" ? "Family" : m.role === "doctor" ? "You" : "Assistant"}</p>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </li>
                  ))}
              </ol>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card className="p-5 lg:sticky lg:top-6">
            <SectionTitle>Respond</SectionTitle>
            {review.doctor_response && (
              <div className="mb-4 rounded-xl border border-success/20 bg-success-bg/50 p-3 text-sm">
                <p className="font-medium">Your last response · {formatDateTime(review.responded_at)}</p>
                <p className="mt-1">{review.doctor_response}</p>
              </div>
            )}
            <ReviewActions reviewId={review.id} status={review.status} />
          </Card>
          <Card className="p-5">
            <SectionTitle>Recent readings (30 days)</SectionTitle>
            <ul className="space-y-1 text-sm">
              {review.measurements.length === 0 && <li className="text-muted">None.</li>}
              {review.measurements.map((m, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>
                    {m.type.replace(/_/g, " ")}
                    {m.context ? ` (${m.context.replace("_", " ")})` : ""}
                  </span>
                  <span className="tabular font-medium">
                    {m.value}
                    {m.secondary_value ? `/${m.secondary_value}` : ""} {m.unit}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <SectionTitle>Recent reports</SectionTitle>
            <ul className="space-y-1 text-sm">
              {review.reports.length === 0 && <li className="text-muted">None.</li>}
              {review.reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/doctor/reports/${r.id}`} className="text-primary-ink hover:underline">
                    {r.title}
                  </Link>{" "}
                  <span className="text-muted">{formatDate(r.date)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
