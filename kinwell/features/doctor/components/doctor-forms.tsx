"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Search, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";
import {
  addDoctorNoteAction,
  addInstructionAction,
  deactivateInstructionAction,
  doctorAppointmentAction,
  doctorSendMessageAction,
  knowledgeStatusAction,
  deleteKnowledgeAction,
  markReportReviewedAction,
  testKnowledgeSearchAction,
  updateDoctorProfileAction,
  uploadKnowledgeAction,
} from "../actions";
import { doctorReviewAction } from "@/features/reviews/actions";
import { saveRuleVersionAction } from "@/features/admin/actions";
import { reportFileUrlAction } from "@/features/reports/actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      after?.();
      router.refresh();
    });
  return { pending, error, run };
}

const INSTRUCTION_TYPES = [
  ["monitoring", "Monitoring instruction"],
  ["avoid_medicine", "Avoid specific medicine"],
  ["dose_restriction", "Dose restriction"],
  ["emergency_threshold", "Emergency threshold"],
  ["diet_restriction", "Diet restriction"],
  ["activity_restriction", "Activity restriction"],
  ["treatment_protocol", "Special treatment protocol"],
  ["general", "General guidance"],
];

export function InstructionForm({ profileId, supersede }: { profileId: string; supersede?: { id: string; type: string; instruction: string; reason: string | null } }) {
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button size="sm" variant={supersede ? "ghost" : "primary"} onClick={() => setOpen(true)}>
        {supersede ? "New version" : "Add instruction"}
      </Button>
    );
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-line bg-page p-4"
      action={(f) =>
        run(
          () => addInstructionAction({ profileId, instructionType: f.get("type"), instruction: f.get("instruction"), reason: f.get("reason") || null, topics: String(f.get("topics") ?? "").split(",").map((t) => t.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean) }, supersede?.id ?? null),
          () => setOpen(false),
        )
      }
    >
      <FormError message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor={`it-${supersede?.id ?? "new"}`}>
          <Select id={`it-${supersede?.id ?? "new"}`} name="type" defaultValue={supersede?.type ?? "monitoring"}>
            {INSTRUCTION_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Topics" htmlFor={`tp-${supersede?.id ?? "new"}`} hint="(comma separated, helps retrieval)">
          <Input id={`tp-${supersede?.id ?? "new"}`} name="topics" placeholder="blood_glucose, diabetes" />
        </Field>
      </div>
      <Field label="Instruction (shown to the patient and prioritised by the assistant)" htmlFor={`in-${supersede?.id ?? "new"}`} required>
        <Textarea id={`in-${supersede?.id ?? "new"}`} name="instruction" defaultValue={supersede?.instruction} required minLength={5} />
      </Field>
      <Field label="Reason" htmlFor={`rs-${supersede?.id ?? "new"}`} hint="(optional)">
        <Input id={`rs-${supersede?.id ?? "new"}`} name="reason" defaultValue={supersede?.reason ?? ""} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          {supersede ? "Save new version" : "Save instruction"}
        </Button>
      </div>
    </form>
  );
}

export function DeactivateInstruction({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" className="text-danger" loading={pending} onClick={() => confirm("Deactivate this instruction? It will no longer be used by the assistant.") && run(() => deactivateInstructionAction(id))}>
      Deactivate
    </Button>
  );
}

export function NoteForm({ profileId }: { profileId: string }) {
  const { pending, error, run } = useRun();
  const [note, setNote] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addDoctorNoteAction(profileId, note), () => setNote(""));
      }}
    >
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add a clinical note to this patient's record (visible to the family)" aria-label="Doctor note" />
      <div className="flex justify-end">
        <Button size="sm" type="submit" loading={pending} disabled={!note.trim()}>
          Add note
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

export function ReviewActions({ reviewId, status, defaultResponse }: { reviewId: string; status: string; defaultResponse?: string | null }) {
  const { pending, error, run } = useRun();
  const [text, setText] = useState(defaultResponse ?? "");
  const [addToRecord, setAddToRecord] = useState(true);
  const act = (action: string) => run(() => doctorReviewAction({ reviewId, action, response: text || null, addToRecord }), () => action !== "start" && setText(""));
  return (
    <div className="space-y-3">
      {status === "pending" && (
        <Button size="sm" variant="secondary" onClick={() => act("start")} loading={pending}>
          Mark as in review
        </Button>
      )}
      <Field label="Your response to the family" htmlFor="rv-resp">
        <Textarea id="rv-resp" value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Write advice in plain language. This appears in the patient's chat and record." />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={addToRecord} onChange={(e) => setAddToRecord(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
        Also save as a doctor note in the patient&apos;s record
      </label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => act("respond")} loading={pending} disabled={!text.trim()}>
          <Send className="h-4 w-4" aria-hidden /> Send response
        </Button>
        <Button variant="secondary" onClick={() => act("approve")} disabled={pending}>
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Approve AI explanation
        </Button>
        <Button variant="secondary" onClick={() => act("request_info")} disabled={pending || !text.trim()}>
          Request more info
        </Button>
        <Button variant="secondary" onClick={() => act("schedule")} disabled={pending}>
          Schedule consultation
        </Button>
        <Button variant="ghost" onClick={() => act("close")} disabled={pending}>
          Mark reviewed &amp; close
        </Button>
      </div>
      <FormError message={error} />
    </div>
  );
}

export function KnowledgeUpload({ categories, replacesId, defaultCategory, defaultTitle }: { categories: readonly string[]; replacesId?: string; defaultCategory?: string; defaultTitle?: string }) {
  const { pending, error, run } = useRun();
  const [mode, setMode] = useState<"file" | "text">("file");
  const [done, setDone] = useState(false);
  return (
    <form
      className="space-y-4"
      action={(f) => {
        if (replacesId) f.set("replacesId", replacesId);
        run(() => uploadKnowledgeAction(f), () => setDone(true));
      }}
    >
      <FormError message={error} />
      {done && (
        <p role="status" className="rounded-xl border border-success/25 bg-success-bg px-3 py-2 text-sm text-success">
          Uploaded and indexed. Review the extracted text, then approve it to make it searchable for your patients.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="kb-title" required>
          <Input id="kb-title" name="title" required defaultValue={defaultTitle} placeholder="e.g. Diabetes self-management protocol" />
        </Field>
        <Field label="Folder / category" htmlFor="kb-cat">
          <Select id="kb-cat" name="category" defaultValue={defaultCategory ?? categories[0]}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Source" htmlFor="kb-src" hint="(book, guideline, own protocol…)" className="sm:col-span-2">
          <Input id="kb-src" name="source" placeholder="e.g. Clinic protocol 2026, reviewed by Dr. Sharma" />
        </Field>
      </div>
      <div className="flex gap-1 rounded-[10px] bg-subtle p-1 text-sm" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "file"} onClick={() => setMode("file")} className={`flex-1 rounded-[8px] px-3 py-1.5 ${mode === "file" ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
          Upload file
        </button>
        <button type="button" role="tab" aria-selected={mode === "text"} onClick={() => setMode("text")} className={`flex-1 rounded-[8px] px-3 py-1.5 ${mode === "text" ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
          Paste text
        </button>
      </div>
      {mode === "file" ? (
        <Field label="Document (PDF, DOCX, TXT, or scanned JPG/PNG)" htmlFor="kb-file">
          <input id="kb-file" name="file" type="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png" required className="block w-full text-sm file:mr-3 file:rounded-[10px] file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-subtle" />
        </Field>
      ) : (
        <Field label="Guidance text" htmlFor="kb-text">
          <Textarea id="kb-text" name="text" rows={8} required placeholder="Paste a protocol, self-care instructions or medicine guidance…" />
        </Field>
      )}
      <Button type="submit" loading={pending}>
        <Upload className="h-4 w-4" aria-hidden /> {replacesId ? "Upload new version" : "Upload & index"}
      </Button>
    </form>
  );
}

export function KnowledgeStatusButtons({ id, status, active }: { id: string; status: string; active: boolean }) {
  const { pending, error, run } = useRun();
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {status === "ready_for_review" && (
        <Button size="sm" loading={pending} onClick={() => run(() => knowledgeStatusAction(id, "approve"))}>
          Approve &amp; activate
        </Button>
      )}
      {status === "approved" && active && (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => knowledgeStatusAction(id, "deactivate"))}>
          Deactivate
        </Button>
      )}
      {status === "approved" && !active && (
        <Button size="sm" loading={pending} onClick={() => run(() => knowledgeStatusAction(id, "reactivate"))}>
          Reactivate
        </Button>
      )}
      {status !== "archived" && (
        <Button size="sm" variant="ghost" onClick={() => run(() => knowledgeStatusAction(id, "archive"))}>
          Archive
        </Button>
      )}
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm("Delete this document and its file permanently?") && run(() => deleteKnowledgeAction(id), () => router.push("/doctor/knowledge"))}>
        Delete
      </Button>
      <FormError message={error} />
    </div>
  );
}

export function KnowledgeTestSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ chunk_id: string; title: string; content: string; score: number; version: number }[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await testKnowledgeSearchAction(q);
            setResults(r.ok ? (r.data ?? []) : []);
          });
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try a patient question, e.g. “sugar 200 after lunch what to do”" aria-label="Test question" />
        <Button type="submit" variant="secondary" loading={pending}>
          <Search className="h-4 w-4" aria-hidden /> Test
        </Button>
      </form>
      {results && (
        <ul className="mt-3 space-y-2">
          {results.length === 0 && <li className="text-sm text-muted">No approved passages matched. Approve documents to make them searchable.</li>}
          {results.map((r) => (
            <li key={r.chunk_id} className="rounded-xl border border-line bg-page p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {r.title} (v{r.version})
                </span>
                <Badge tone="info" icon={false}>
                  relevance {r.score}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-3 text-muted">{r.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DoctorMessageForm({ familyId }: { familyId: string }) {
  const { pending, error, run } = useRun();
  const [body, setBody] = useState("");
  return (
    <form
      className="flex gap-2 border-t border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => doctorSendMessageAction(familyId, body), () => setBody(""));
      }}
    >
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="min-h-0" placeholder="Write to the family…" aria-label="Message" />
      <Button type="submit" size="icon" className="self-end" loading={pending} disabled={!body.trim()} aria-label="Send">
        <Send className="h-4 w-4" />
      </Button>
      <FormError message={error} />
    </form>
  );
}

export function AppointmentStatusButtons({ id, status }: { id: string; status: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      {status === "requested" && (
        <Button size="sm" loading={pending} onClick={() => run(() => doctorAppointmentAction(id, "confirmed"))}>
          Confirm
        </Button>
      )}
      {status === "confirmed" && (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => doctorAppointmentAction(id, "completed"))}>
          Mark completed
        </Button>
      )}
      {(status === "requested" || status === "confirmed") && (
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm("Cancel this appointment?") && run(() => doctorAppointmentAction(id, "cancelled"))}>
          Cancel
        </Button>
      )}
    </div>
  );
}

export function MarkReviewed({ reportId, notes, reviewed }: { reportId: string; notes: string | null; reviewed: boolean }) {
  const { pending, error, run } = useRun();
  const [text, setText] = useState(notes ?? "");
  return (
    <div className="space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Notes for the family about this report" aria-label="Report notes" />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={pending} onClick={() => run(() => markReportReviewedAction(reportId, text || null))}>
          {reviewed ? "Update notes" : "Mark reviewed"}
        </Button>
        <OpenReportFile reportId={reportId} />
      </div>
      <FormError message={error} />
    </div>
  );
}

export function OpenReportFile({ reportId }: { reportId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await reportFileUrlAction(reportId);
          if (r.ok && r.data) window.open(r.data.url, "_blank", "noopener");
        })
      }
    >
      Open original
    </Button>
  );
}

export function DoctorProfileForm({ doctor }: { doctor: { speciality: string; clinic_name: string | null; clinic_address: string | null; bio: string | null; contact_hours: string | null; accepting_reviews: boolean; languages: string[] } }) {
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      action={(f) =>
        run(
          () =>
            updateDoctorProfileAction({
              speciality: String(f.get("speciality")),
              clinic_name: String(f.get("clinic_name")),
              clinic_address: String(f.get("clinic_address")),
              bio: String(f.get("bio")),
              contact_hours: String(f.get("contact_hours")),
              languages: String(f.get("languages")).split(",").map((l) => l.trim()).filter(Boolean),
              accepting_reviews: f.get("accepting_reviews") === "on",
            }),
          () => setSaved(true),
        )
      }
    >
      <Field label="Speciality" htmlFor="dp-s">
        <Input id="dp-s" name="speciality" defaultValue={doctor.speciality} />
      </Field>
      <Field label="Clinic" htmlFor="dp-c">
        <Input id="dp-c" name="clinic_name" defaultValue={doctor.clinic_name ?? ""} />
      </Field>
      <Field label="Clinic address" htmlFor="dp-a" className="sm:col-span-2">
        <Input id="dp-a" name="clinic_address" defaultValue={doctor.clinic_address ?? ""} />
      </Field>
      <Field label="Languages" htmlFor="dp-l" hint="(comma separated)">
        <Input id="dp-l" name="languages" defaultValue={doctor.languages.join(", ")} />
      </Field>
      <Field label="Contact hours" htmlFor="dp-h">
        <Input id="dp-h" name="contact_hours" defaultValue={doctor.contact_hours ?? ""} />
      </Field>
      <Field label="Bio" htmlFor="dp-b" className="sm:col-span-2">
        <Textarea id="dp-b" name="bio" defaultValue={doctor.bio ?? ""} rows={3} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="accepting_reviews" defaultChecked={doctor.accepting_reviews} className="h-4 w-4 accent-[var(--color-primary)]" />
        Accepting review requests (families see “unavailable” when off)
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" loading={pending}>
          Save profile
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
      <FormError message={error} />
    </form>
  );
}

export function RuleEditor({ rule }: { rule: { id: string; rule_key: string; min_value: number | null; max_value: number | null; secondary_min: number | null; secondary_max: number | null; severity: string; status_label: string; recommended_action: string; version: number; measurement_type: string | null } }) {
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  return (
    <form
      className="mt-2 grid gap-2 rounded-xl border border-line bg-page p-3 sm:grid-cols-4"
      action={(f) =>
        run(
          () =>
            saveRuleVersionAction({
              id: rule.id,
              min_value: f.get("min") === "" ? null : f.get("min"),
              max_value: f.get("max") === "" ? null : f.get("max"),
              secondary_min: f.get("smin") === "" ? null : f.get("smin"),
              secondary_max: f.get("smax") === "" ? null : f.get("smax"),
              severity: f.get("severity"),
              status_label: f.get("label"),
              recommended_action: f.get("action"),
              reviewed_by: f.get("reviewed_by"),
            }),
          () => setOpen(false),
        )
      }
    >
      <Input name="min" defaultValue={rule.min_value ?? ""} placeholder="Min (≥)" aria-label="Minimum" />
      <Input name="max" defaultValue={rule.max_value ?? ""} placeholder="Max (<)" aria-label="Maximum" />
      {rule.measurement_type === "blood_pressure" ? (
        <>
          <Input name="smin" defaultValue={rule.secondary_min ?? ""} placeholder="Diastolic min" aria-label="Diastolic minimum" />
          <Input name="smax" defaultValue={rule.secondary_max ?? ""} placeholder="Diastolic max" aria-label="Diastolic maximum" />
        </>
      ) : (
        <>
          <input type="hidden" name="smin" value="" />
          <input type="hidden" name="smax" value="" />
        </>
      )}
      <Select name="severity" defaultValue={rule.severity} aria-label="Severity">
        {["LOW", "MODERATE", "HIGH", "EMERGENCY"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </Select>
      <Input name="label" defaultValue={rule.status_label} aria-label="Status label" className="sm:col-span-3" />
      <Textarea name="action" defaultValue={rule.recommended_action} aria-label="Recommended action" rows={2} className="min-h-0 sm:col-span-4" />
      <Input name="reviewed_by" required placeholder="Reviewed by (name, credential)" aria-label="Reviewed by" className="sm:col-span-3" />
      <Button type="submit" size="sm" loading={pending}>
        Save v{rule.version + 1}
      </Button>
      <FormError message={error} />
    </form>
  );
}
