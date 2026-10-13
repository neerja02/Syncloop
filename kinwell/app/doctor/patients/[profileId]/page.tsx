import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Pill } from "lucide-react";
import { requireDoctor } from "@/lib/security/session";
import { getProfile } from "@/lib/services/profiles";
import { listAllergies, listConditions, listDoctorInstructions, listDoctorNotes, listMeasurements, listMedications } from "@/lib/services/health-record";
import { listReports } from "@/lib/services/reports";
import { listFamilyReviews } from "@/lib/services/reviews";
import { getDb } from "@/lib/database/client";
import { ForbiddenError, NotFoundError, logAccess } from "@/lib/security/access";
import { ageFromDob, formatDate, formatDateTime } from "@/lib/utils/format";
import { RELATIONSHIP_LABELS } from "@/types/domain";
import { Avatar, Badge, Card, PageHeader, SectionTitle } from "@/components/ui/misc";
import { TrendChart } from "@/components/charts/trend-chart";
import { DeactivateInstruction, InstructionForm, NoteForm } from "@/features/doctor/components/doctor-forms";

export const metadata = { title: "Patient" };

export default async function DoctorPatientPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const actor = await requireDoctor();
  let profile;
  try {
    profile = await getProfile(actor, profileId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) notFound();
    throw e;
  }
  await logAccess(actor, "view", "profile", profileId, profile.family_id);
  const [conditions, allergies, meds, glucose, bp, reports, instructions, notes, reviews] = await Promise.all([
    listConditions(actor, profileId),
    listAllergies(actor, profileId),
    listMedications(actor, profileId),
    listMeasurements(actor, profileId, "blood_glucose", "3m"),
    listMeasurements(actor, profileId, "blood_pressure", "3m"),
    listReports(actor, profile.family_id, { profileId, limit: 12 }),
    listDoctorInstructions(actor, profileId, true),
    listDoctorNotes(actor, profileId),
    listFamilyReviews(actor, profile.family_id, profileId),
  ]);
  const db = await getDb();
  const audit = (await db.query<{ answer_id: string; agent: string; intent: string | null; urgency: string | null; provider: string; model: string; knowledge_documents_used: { title: string; version: number }[]; clinical_rules_used: { rule_key: string; version: number }[]; medications_referenced: { name: string }[]; context_sections: string[]; doctor_review_status: string | null; created_at: Date }>(
    "select * from agent_audit_logs where profile_id = $1 order by created_at desc limit 15",
    [profileId],
  )).rows;
  const age = ageFromDob(profile.date_of_birth);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow={<Link href={`/doctor/families/${profile.family_id}`}>← Family</Link>}
        title={profile.display_name}
        description={[RELATIONSHIP_LABELS[profile.relationship], age != null ? `${age} years` : null, profile.sex, profile.blood_group, profile.weight_kg ? `${profile.weight_kg} kg` : null].filter(Boolean).join(" · ")}
        actions={<Avatar name={profile.display_name} color={profile.avatar_color} size={44} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section aria-labelledby="instr">
            <SectionTitle id="instr" action={<InstructionForm profileId={profileId} />}>
              Patient-specific instructions
            </SectionTitle>
            <p className="-mt-2 mb-3 text-[13px] text-muted">These take priority over all general AI guidance for this patient.</p>
            <Card className="divide-y divide-line">
              {instructions.length === 0 && <p className="p-4 text-sm text-muted">No instructions yet.</p>}
              {instructions.map((i) => (
                <div key={i.id} className={`p-4 ${i.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <Badge tone={i.active ? "primary" : "neutral"} icon={false}>
                      {i.instruction_type.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-muted">
                      v{i.version} · {formatDate(i.created_at)} {i.active ? "" : "· inactive"}
                    </span>
                    {i.topics.length > 0 && <span className="text-muted">· topics: {i.topics.join(", ")}</span>}
                  </div>
                  <p className="mt-1.5 text-[15px]">{i.instruction}</p>
                  {i.reason && <p className="mt-0.5 text-[13px] text-muted">Reason: {i.reason}</p>}
                  {i.active && (
                    <div className="mt-2 flex gap-1">
                      <InstructionForm profileId={profileId} supersede={{ id: i.id, type: i.instruction_type, instruction: i.instruction, reason: i.reason }} />
                      <DeactivateInstruction id={i.id} />
                    </div>
                  )}
                </div>
              ))}
            </Card>
          </section>

          {(glucose.length > 1 || bp.length > 1) && (
            <section aria-labelledby="trends">
              <SectionTitle id="trends">Measurements (3 months)</SectionTitle>
              <div className="grid gap-4 md:grid-cols-2">
                {glucose.length > 1 && (
                  <Card className="p-4">
                    <p className="text-sm font-medium">Blood glucose ({glucose.length})</p>
                    <TrendChart points={[...glucose].reverse().map((g) => ({ t: new Date(g.measured_at).toISOString(), v: g.value }))} unit="mg/dL" label="Glucose" height={170} compact />
                  </Card>
                )}
                {bp.length > 1 && (
                  <Card className="p-4">
                    <p className="text-sm font-medium">Blood pressure ({bp.length})</p>
                    <TrendChart points={[...bp].reverse().map((g) => ({ t: new Date(g.measured_at).toISOString(), v: g.value, v2: g.secondary_value }))} unit="mmHg" label="Systolic" secondaryLabel="Diastolic" height={170} compact />
                  </Card>
                )}
              </div>
            </section>
          )}

          <section aria-labelledby="reports">
            <SectionTitle id="reports">Reports</SectionTitle>
            <Card className="divide-y divide-line">
              {reports.length === 0 && <p className="p-4 text-sm text-muted">No reports uploaded.</p>}
              {reports.map((r) => (
                <Link key={r.id} href={`/doctor/reports/${r.id}`} className="flex items-center gap-3 p-4 hover:bg-subtle">
                  <FileText className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="text-[13px] text-muted">{formatDate(r.report_date ?? r.created_at)}</span>
                  </span>
                  {r.doctor_reviewed_at ? <Badge tone="success">Reviewed</Badge> : <Badge tone="info">Not reviewed</Badge>}
                </Link>
              ))}
            </Card>
          </section>

          <section aria-labelledby="audit" id="audit">
            <SectionTitle id="audit-title">AI answers — what information was used</SectionTitle>
            <Card className="divide-y divide-line">
              {audit.length === 0 && <p className="p-4 text-sm text-muted">No AI answers yet.</p>}
              {audit.map((a) => (
                <details key={a.answer_id} className="group p-4">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                    <Badge tone={a.urgency === "EMERGENCY" || a.urgency === "HIGH" ? "danger" : a.urgency === "MODERATE" ? "warning" : "neutral"}>{a.urgency ?? "LOW"}</Badge>
                    <span className="font-medium">{a.agent}</span>
                    <span className="text-[13px] text-muted">
                      {a.intent} · {formatDateTime(a.created_at)}
                    </span>
                    {a.doctor_review_status && <Badge tone="info" icon={false}>review: {a.doctor_review_status}</Badge>}
                  </summary>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Model</dt>
                      <dd>
                        {a.provider} / {a.model}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Record sections loaded</dt>
                      <dd>{a.context_sections.join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Your documents used</dt>
                      <dd>{a.knowledge_documents_used.map((d) => `${d.title} v${d.version}`).join("; ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Clinical rules</dt>
                      <dd>{a.clinical_rules_used.map((r) => `${r.rule_key} v${r.version}`).join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Medicines referenced</dt>
                      <dd>{a.medications_referenced.map((m) => m.name).join(", ") || "—"}</dd>
                    </div>
                  </dl>
                </details>
              ))}
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Conditions &amp; allergies</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conditions.map((c) => (
                <Badge key={c.id} icon={false}>
                  {c.name} ({c.status})
                </Badge>
              ))}
              {allergies.map((a) => (
                <Badge key={a.id} tone="danger">
                  {a.substance}
                  {a.reaction ? ` — ${a.reaction}` : ""}
                </Badge>
              ))}
              {!conditions.length && !allergies.length && <p className="text-sm text-muted">None recorded.</p>}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Medicines</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {meds.map((m) => (
                <li key={m.id} className={`flex gap-2 ${m.status === "active" ? "" : "opacity-60"}`}>
                  <Pill className="mt-0.5 h-4 w-4 shrink-0 text-primary-ink" aria-hidden />
                  <span>
                    <span className="font-medium">
                      {m.name} {m.strength}
                    </span>{" "}
                    <span className="text-muted">
                      · {m.frequency} · {m.status}
                    </span>
                  </span>
                </li>
              ))}
              {!meds.length && <li className="text-muted">None recorded.</li>}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-[15px] font-semibold">Clinical notes</h2>
            <NoteForm profileId={profileId} />
            <ul className="mt-3 space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="text-sm">
                  <p>{n.note}</p>
                  <p className="text-[12px] text-muted">{formatDateTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Review history</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {reviews.length === 0 && <li className="text-muted">No reviews.</li>}
              {reviews.map((r) => (
                <li key={r.id}>
                  <Link href={`/doctor/reviews/${r.id}`} className="hover:underline">
                    {r.question.slice(0, 80)}
                  </Link>
                  <span className="block text-[12px] text-muted">
                    {r.status.replace(/_/g, " ")} · {formatDate(r.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
