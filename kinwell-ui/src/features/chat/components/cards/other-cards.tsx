import Link from "@/adapters/link";
import { useState, useTransition } from "react";
import { AlertTriangle, BookOpen, Check, ChevronDown, ClipboardList, FileText, Info, Pill, Quote, Stethoscope, UserRoundCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { TrendChart } from "@/components/charts/trend-chart";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import type {
  ActionsCard,
  DoctorGuidanceCard,
  InfoCard,
  MedicationConfirmCard,
  MedicationInfoCard,
  ProfileSwitchCard,
  QuickRepliesCard,
  RecordProposalCard,
  ReportSummaryCard,
  SourcesCard,
  TrendCard,
} from "@/lib/ai/types";
import { confirmRecordProposalAction, resolveProfileSwitchAction, updateCardStatusAction, answerSourcesAction } from "@/api/chat";
import { useChat } from "../chat-context";

export function QuickReplies({ card }: { card: QuickRepliesCard }) {
  const chat = useChat();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested replies">
      {card.options.map((o) => (
        <button key={o.label} type="button" disabled={chat.busy} onClick={() => chat.send(o.value)} className="rounded-full border border-primary/25 bg-surface px-3.5 py-1.5 text-[14px] font-medium text-primary-dark hover:bg-accent-light/50 disabled:opacity-50">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Actions({ card, messageId }: { card: ActionsCard; messageId: string }) {
  const chat = useChat();
  return (
    <div className="flex flex-wrap gap-2">
      {card.actions.map((a) => (
        <Button key={a.label} size="sm" variant={a.variant === "primary" ? "primary" : "secondary"} onClick={() => chat.runAction(a, messageId)} disabled={chat.busy}>
          {a.kind === "send_review" && <Stethoscope className="h-4 w-4" aria-hidden />}
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export function RecordProposal({ card, messageId }: { card: RecordProposalCard; messageId: string }) {
  const chat = useChat();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (d: "save" | "dismiss") =>
    start(async () => {
      const r = await confirmRecordProposalAction(messageId, card.id, d);
      if (!r.ok) return setError(r.error);
      chat.patchCard(messageId, card.id, { status: d === "save" ? "saved" : "dismissed" });
    });
  if (card.status === "saved")
    return (
      <p className="flex items-center gap-2 text-sm text-success" role="status">
        <Check className="h-4 w-4" aria-hidden /> Saved to {card.profileName}&apos;s record.
      </p>
    );
  if (card.status === "dismissed") return <p className="text-sm text-muted">Not saved.</p>;
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-3.5 sm:flex-row sm:items-center">
      <ClipboardList className="hidden h-5 w-5 shrink-0 text-primary-ink sm:block" aria-hidden />
      <p className="flex-1 text-[15px]">{card.label}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => act("save")} loading={pending}>
          {card.kind === "measurement" ? "Save reading" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => act("dismiss")} disabled={pending}>
          Not now
        </Button>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function ProfileSwitch({ card, messageId }: { card: ProfileSwitchCard; messageId: string }) {
  const chat = useChat();
  const [pending, start] = useTransition();
  if (card.status !== "pending")
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <UserRoundCheck className="h-4 w-4" aria-hidden /> {card.status === "switched" ? `Switched to ${card.profileName}.` : `Kept ${card.currentProfileName}.`}
      </p>
    );
  const act = (d: "switch" | "keep") =>
    start(async () => {
      if (!chat.conversationId) return;
      const r = await resolveProfileSwitchAction(chat.conversationId, messageId, card.id, d);
      if (r.ok && r.data) chat.replaceMessages(r.data);
    });
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-primary/20 bg-accent-light/30 p-3.5 sm:flex-row sm:items-center">
      <p className="flex-1 font-medium">{card.question}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => act("switch")} loading={pending}>
          Yes, {card.profileName}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => act("keep")} disabled={pending}>
          No, keep {card.currentProfileName}
        </Button>
      </div>
    </div>
  );
}

export function MedicationConfirm({ card, messageId }: { card: MedicationConfirmCard; messageId: string }) {
  const chat = useChat();
  const [mode, setMode] = useState<"idle" | "choose" | "manual">("idle");
  const [manual, setManual] = useState("");
  const choose = (name: string, status: MedicationConfirmCard["status"]) => {
    chat.patchCard(messageId, card.id, { status, chosen: name });
    void updateCardStatusAction(messageId, card.id, { status, chosen: name });
    chat.send(`Yes, I meant ${name}`);
  };
  if (card.status !== "pending") return <p className="text-sm text-muted">Medicine confirmed: {card.chosen}</p>;
  return (
    <div className="rounded-[14px] border border-warning/30 bg-warning-bg/50 p-3.5">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Did you mean {card.suggestion}?
      </p>
      <p className="mt-0.5 text-sm text-muted">You wrote &ldquo;{card.original}&rdquo;.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => choose(card.suggestion, "confirmed")} disabled={chat.busy}>
          Yes
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setMode(mode === "choose" ? "idle" : "choose")}>
          Choose another
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setMode(mode === "manual" ? "idle" : "manual")}>
          Enter manually
        </Button>
      </div>
      {mode === "choose" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.alternatives.length ? (
            card.alternatives.map((a) => (
              <Button key={a} size="sm" variant="ghost" className="border border-line" onClick={() => choose(a, "confirmed")}>
                {a}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted">No other close matches. Try entering it manually.</p>
          )}
        </div>
      )}
      {mode === "manual" && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) choose(manual.trim(), "manual");
          }}
        >
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Medicine name as printed" aria-label="Medicine name" className="h-9" />
          <Button size="sm" type="submit">
            Use this
          </Button>
        </form>
      )}
    </div>
  );
}

export function DoctorGuidance({ card }: { card: DoctorGuidanceCard }) {
  return (
    <section className="rounded-[14px] border border-primary/20 bg-surface" aria-label={`Guidance from ${card.doctorName}`}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Stethoscope className="h-4 w-4 text-primary-ink" aria-hidden />
        <span className="text-sm font-semibold text-primary-dark">From {card.doctorName}</span>
        <Badge tone="primary" icon={false} className="ml-auto">
          Doctor-provided
        </Badge>
      </div>
      <ul className="divide-y divide-line">
        {card.items.map((i, idx) => (
          <li key={idx} className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-muted">
              {i.kind === "knowledge" ? <BookOpen className="h-3.5 w-3.5" aria-hidden /> : i.kind === "note" ? <FileText className="h-3.5 w-3.5" aria-hidden /> : <Quote className="h-3.5 w-3.5" aria-hidden />}
              {i.kind === "instruction" ? "Patient-specific instruction" : i.kind === "note" ? "Doctor's note" : "Practice guidance"}
              {i.version ? ` · v${i.version}` : ""}
              {i.date ? ` · ${formatDate(i.date)}` : ""}
            </div>
            <p className="mt-0.5 text-[13px] font-medium">{i.title}</p>
            <p className="mt-1 text-[15px]">{i.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function InfoBlock({ card }: { card: InfoCard }) {
  const Icon = card.tone === "warning" ? AlertTriangle : card.tone === "success" ? Check : Info;
  return (
    <section className={cn("rounded-[14px] border p-3.5", card.tone === "warning" ? "border-warning/25 bg-warning-bg/50" : card.tone === "success" ? "border-success/20 bg-success-bg/50" : "border-line bg-surface")}>
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn("h-4 w-4", card.tone === "warning" ? "text-warning" : card.tone === "success" ? "text-success" : "text-primary-ink")} aria-hidden />
        {card.title}
      </h4>
      <p className="mt-1.5 whitespace-pre-line text-[14px] text-ink/85">{card.body}</p>
    </section>
  );
}

export function MedicationInfo({ card }: { card: MedicationInfoCard }) {
  return (
    <section className="rounded-[14px] border border-line bg-surface p-4">
      <h4 className="flex items-center gap-2 font-semibold">
        <Pill className="h-4 w-4 text-primary-ink" aria-hidden /> {card.name}
      </h4>
      {card.onRecord ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {[
            ["Strength", card.onRecord.strength],
            ["How often", card.onRecord.frequency],
            ["Instructions", card.onRecord.instructions],
            ["Prescribed by", card.onRecord.prescribingDoctor],
            ["Reason", card.onRecord.reason],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
      ) : (
        <p className="mt-1 text-sm text-muted">Not on the current medicine list.</p>
      )}
      {card.cautions.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {card.cautions.map((c) => (
            <li key={c} className="flex gap-2 rounded-lg bg-warning-bg/60 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden /> {c}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ReportSummary({ card }: { card: ReportSummaryCard }) {
  return (
    <section className="rounded-[14px] border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{card.title}</p>
          <p className="text-[13px] text-muted">{formatDate(card.date)}</p>
        </div>
        <Link href={`/reports/${card.reportId}`} className="shrink-0 text-sm font-medium text-primary-ink hover:underline">
          Open report
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Test</th>
            <th>Result</th>
            <th>Previous</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {card.highlights.map((h) => (
            <tr key={h.name}>
              <td className="px-4 py-2.5">{h.name}</td>
              <td className="tabular px-2 py-2.5 font-semibold">
                {h.value != null ? `${h.value} ${h.unit ?? ""}` : <span className="font-normal text-warning">Couldn&apos;t read “{h.valueText}”</span>}
                {h.previous != null && <span className="block text-[12px] font-normal text-muted sm:hidden">prev. {h.previous}</span>}
              </td>
              <td className="tabular hidden px-2 py-2.5 text-muted sm:table-cell">{h.previous != null ? `prev. ${h.previous}` : ""}</td>
              <td className="px-4 py-2.5 text-right">
                {h.status === "unreadable" ? <Badge tone="warning">Needs value</Badge> : h.flag === "high" ? <Badge tone="warning">Above range</Badge> : h.flag === "low" ? <Badge tone="warning">Below range</Badge> : h.flag === "normal" ? <Badge tone="success">In range</Badge> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Trend({ card }: { card: TrendCard }) {
  return (
    <section className="rounded-[14px] border border-line bg-surface p-4">
      <p className="font-semibold">{card.label}</p>
      <p className="mb-2 text-sm text-muted">{card.summary}</p>
      <TrendChart points={card.points} unit={card.unit} label={card.measurementType === "blood_pressure" ? "Systolic" : card.measurementType} secondaryLabel="Diastolic" height={180} />
    </section>
  );
}

interface AuditLog {
  agent: string;
  model: string;
  provider: string;
  knowledge_documents_used: { title: string; version: number; doctor: string }[];
  retrieved_chunks: { excerpt: string; score: number }[];
  clinical_rules_used: { rule_key: string; version: number; source: string }[];
  medications_referenced: { name: string }[];
  context_sections: string[];
  created_at: string;
}

export function Sources({ card }: { card: SourcesCard }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="text-[13px]">
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink" aria-expanded={open}>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} aria-hidden /> Where this answer came from
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-line bg-surface p-3">
          <ul className="space-y-1">
            {card.items.map((i, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>
                  <span className="font-medium">
                    {{ doctor_instruction: "Doctor instruction", doctor_knowledge: "Doctor's library", patient_record: "Health record", clinical_rule: "Clinical rule", reference: "Reference", general: "General" }[i.kind]}
                    :{" "}
                  </span>
                  {i.label}
                </span>
              </li>
            ))}
          </ul>
          {!detail ? (
            <button
              type="button"
              className="mt-2 font-medium text-primary-ink hover:underline"
              onClick={() =>
                start(async () => {
                  const r = await answerSourcesAction(card.answerId);
                  if (r.ok) setDetail(r.data as unknown as AuditLog);
                })
              }
            >
              {pending ? "Loading…" : "Show technical details"}
            </button>
          ) : (
            <div className="mt-2 space-y-1 border-t border-line pt-2 text-muted">
              <p>
                Agent: {detail.agent} · Model: {detail.provider}/{detail.model}
              </p>
              {detail.retrieved_chunks.slice(0, 3).map((c, i) => (
                <p key={i} className="italic">
                  “{c.excerpt}…” (relevance {c.score})
                </p>
              ))}
            </div>
          )}
          <p className="mt-2 text-muted">This is general information, not a diagnosis.</p>
        </div>
      )}
    </div>
  );
}

export function DoctorReplyBadge({ doctorName }: { doctorName: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-primary-dark">
      <Stethoscope className="h-3.5 w-3.5" aria-hidden /> {doctorName} replied
    </span>
  );
}

export function Dismissed() {
  return <X className="h-4 w-4" aria-hidden />;
}
