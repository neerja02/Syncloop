import { useState } from "react";
import { useRouter } from "@/adapters/navigation";
import { Camera, Check, FileUp, FolderOpen, LocateFixed, Loader2, PenLine, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { QuestionCard as Card, QuestionOption } from "@/lib/ai/types";
import { useChat } from "../chat-context";
import { BodyMapPicker } from "./body-map";

/*
 * Tap-to-answer building blocks. They render inside the conversation (not as separate forms), and once a
 * question is answered the chosen option appears as the user's chat bubble and these controls disappear.
 */

type Pick = (value: string, reply: string) => void;

export function QuickReplyChip({ label, hint, selected, onClick, disabled, className }: { label: string; hint?: string; selected?: boolean; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-left text-[15px] font-medium leading-snug transition-colors disabled:opacity-50",
        selected ? "border-primary bg-primary text-white" : "border-primary/25 bg-surface text-primary-dark hover:border-primary/50 hover:bg-accent-light",
        className,
      )}
    >
      {selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
      {label}
      {hint && <span className={cn("text-[13px] font-normal", selected ? "text-white/80" : "text-muted")}>{hint}</span>}
    </button>
  );
}

export function QuickReplyGroup({ options, onPick, disabled, label = "Choose an answer" }: { options: QuestionOption[]; onPick: Pick; disabled?: boolean; label?: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <QuickReplyChip key={o.value} label={o.label} hint={o.hint} disabled={disabled} onClick={() => onPick(o.value, o.reply ?? o.label)} />
      ))}
    </div>
  );
}

/** Symptom categories: a two-column grid of large, light buttons. */
export function SymptomSelector({ options, onPick, disabled }: { options: QuestionOption[]; onPick: Pick; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Symptoms">
      {options.map((o) => (
        <button key={o.value} type="button" disabled={disabled} onClick={() => onPick(o.value, o.reply ?? o.label)} className="min-h-12 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left text-[15px] font-medium hover:border-primary/40 hover:bg-accent-light disabled:opacity-50">
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Body regions as an easy-to-scan grid. */
export function BodyRegionSelector({ options, onPick, disabled }: { options: QuestionOption[]; onPick: Pick; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Body area">
      {options.map((o) => (
        <button key={o.value} type="button" disabled={disabled} onClick={() => onPick(o.value, o.reply ?? o.label)} className={cn("min-h-12 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left text-[15px] font-medium hover:border-primary/40 hover:bg-accent-light disabled:opacity-50", o.value === "unsure" && "text-muted")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DurationSelector({ options, onPick, disabled }: { options: QuestionOption[]; onPick: Pick; disabled?: boolean }) {
  return <QuickReplyGroup options={options} onPick={onPick} disabled={disabled} label="How long" />;
}

export function YesNoSelector({ options, onPick, disabled }: { options: QuestionOption[]; onPick: Pick; disabled?: boolean }) {
  return (
    <div className="flex gap-2" role="group" aria-label="Yes or no">
      {options.map((o) => (
        <QuickReplyChip key={o.value} label={o.label} disabled={disabled} className="min-w-[88px] justify-center" onClick={() => onPick(o.value, o.reply ?? o.label)} />
      ))}
    </div>
  );
}

const SCALE_TONE = ["border-success/40 hover:bg-success-bg", "border-warning-accent/50 hover:bg-warning-bg", "border-danger/40 hover:bg-danger-bg"];
const SCALE_BAR = ["bg-success", "bg-warning-accent", "bg-danger"];

/** Visual 3-band pain/severity scale: 1–3 Mild · 4–6 Moderate · 7–10 Severe. */
export function PainScale({ options, onPick, disabled }: { options: QuestionOption[]; onPick: Pick; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Severity">
      {options.map((o, i) => (
        <button key={o.value} type="button" disabled={disabled} onClick={() => onPick(o.value, o.reply ?? o.label)} className={cn("flex min-h-[72px] flex-col items-start justify-between rounded-2xl border bg-surface p-3 text-left disabled:opacity-50", SCALE_TONE[i] ?? SCALE_TONE[1])}>
          <span className="flex w-full gap-1" aria-hidden>
            {[0, 1, 2].map((b) => (
              <span key={b} className={cn("h-1.5 flex-1 rounded-full", b <= i ? SCALE_BAR[i] : "bg-line")} />
            ))}
          </span>
          <span>
            {o.hint && <span className="block text-[13px] text-muted">{o.hint}</span>}
            <span className="block text-[15px] font-semibold">{o.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Multi-select ("any of these?") with an exclusive "None of these". */
export function MultiChoiceCard({ options, onPick, disabled }: { options: QuestionOption[]; onPick: Pick; disabled?: boolean }) {
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (o: QuestionOption) => {
    if (o.exclusive) return onPick(o.value, o.reply ?? o.label);
    setSel((s) => (s.includes(o.value) ? s.filter((x) => x !== o.value) : [...s, o.value]));
  };
  const chosen = options.filter((o) => sel.includes(o.value));
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2" role="group" aria-label="Select all that apply">
        {options.map((o) => {
          const on = sel.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(o)}
              aria-pressed={o.exclusive ? undefined : on}
              className={cn("flex min-h-12 items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-[15px] transition-colors disabled:opacity-50", on ? "border-primary bg-accent-light font-medium" : "border-line bg-surface hover:border-primary/40", o.exclusive && "font-medium text-primary-dark")}
            >
              {!o.exclusive && (
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-primary bg-primary text-white" : "border-line")} aria-hidden>
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
              )}
              {o.label}
            </button>
          );
        })}
      </div>
      {sel.length > 0 && (
        <button type="button" disabled={disabled} onClick={() => onPick(sel.join("|"), chosen.map((o) => o.label).join(", "))} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
          Continue <SendHorizontal className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Inline number entry (one value, or two for blood pressure). */
export function InlineNumberInput({ spec, onPick, disabled }: { spec: NonNullable<Card["number"]>; onPick: Pick; disabled?: boolean }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    const x = Number(a);
    if (!a || Number.isNaN(x) || x < spec.min || x > spec.max) return setErr(`Enter a value between ${spec.min} and ${spec.max}.`);
    if (spec.secondary) {
      const y = Number(b);
      if (!b || Number.isNaN(y) || y < spec.secondary.min || y > spec.secondary.max) return setErr(`Enter the bottom number (${spec.secondary.min}–${spec.secondary.max}).`);
      if (y >= x) return setErr("The top number is usually larger than the bottom one — please check.");
      return onPick(`${x}/${y}`, `${x}/${y} ${spec.unit}`);
    }
    onPick(String(x), `${x}${spec.unit === "%" ? "%" : ` ${spec.unit}`}`);
  };
  const field = "h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[18px] font-semibold tabular-nums placeholder:font-normal placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <div className={cn("grid items-end gap-2", spec.secondary ? "grid-cols-[1fr_auto_1fr]" : "grid-cols-[1fr_auto]")}>
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">{spec.label}</span>
          <input autoFocus inputMode="decimal" step={spec.step ?? 1} value={a} onChange={(e) => setA(e.target.value.replace(/[^\d.]/g, ""))} placeholder={spec.placeholder} className={field} aria-invalid={!!err} />
        </label>
        {spec.secondary ? (
          <>
            <span className="pb-3 text-xl text-muted" aria-hidden>
              /
            </span>
            <label className="block">
              <span className="mb-1 block text-[13px] text-muted">{spec.secondary.label}</span>
              <input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/[^\d]/g, ""))} placeholder={spec.secondary.placeholder} className={field} />
            </label>
          </>
        ) : (
          <span className="pb-3 text-[15px] text-muted">{spec.unit}</span>
        )}
      </div>
      {spec.secondary && <p className="text-[13px] text-muted">{spec.unit}</p>}
      {err && (
        <p className="text-[13px] text-danger" role="alert">
          {err}
        </p>
      )}
      <button type="submit" disabled={disabled || !a} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
        Continue <SendHorizontal className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );
}

const UPLOAD_ICON = { camera: Camera, upload: FileUp, pick: FolderOpen } as Record<string, typeof Camera>;

/** Take Photo · Upload PDF · Choose from Reports (plus optional extra answers such as "Enter value"). */
export function UploadChoice({ options, onPick, disabled, photo }: { options: QuestionOption[]; onPick: Pick; disabled?: boolean; photo?: boolean }) {
  const chat = useChat();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="group" aria-label="Share a report">
      {options.map((o) => {
        const Icon = UPLOAD_ICON[o.value] ?? PenLine;
        const isFile = o.value in UPLOAD_ICON;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => (isFile ? chat.shareReport(o.value as "camera" | "upload" | "pick", photo ? "photo" : undefined) : onPick(o.value, o.reply ?? o.label))}
            className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-left text-[15px] font-medium hover:border-primary/40 hover:bg-accent-light disabled:opacity-50"
          >
            <Icon className="h-5 w-5 text-primary-ink" aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Which city are you in?" — detect location, or type the city. */
export function LocationRequest({ onPick, disabled, placeholder }: { onPick: Pick; disabled?: boolean; placeholder?: string }) {
  const [city, setCity] = useState("");
  const [state, setState] = useState<"idle" | "locating" | "error">("idle");
  const detect = () => {
    if (!("geolocation" in navigator)) return setState("error");
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => onPick(`geo:${p.coords.latitude.toFixed(3)},${p.coords.longitude.toFixed(3)}`, "Use my current location"),
      () => setState("error"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };
  return (
    <div className="space-y-2.5">
      <button type="button" onClick={detect} disabled={disabled || state === "locating"} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-surface px-4 text-[15px] font-medium text-primary-dark hover:bg-accent-light disabled:opacity-60 sm:w-auto">
        {state === "locating" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <LocateFixed className="h-5 w-5" aria-hidden />}
        {state === "locating" ? "Finding your location…" : "Detect my location"}
      </button>
      {state === "error" && <p className="text-[13px] text-muted">Couldn&apos;t get your location — type your city instead.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (city.trim().length >= 2) onPick(city.trim(), city.trim());
        }}
        className="flex gap-2"
      >
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={placeholder ?? "Enter your city"} aria-label="City" autoComplete="address-level2" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[16px] placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15" />
        <button type="submit" disabled={disabled || city.trim().length < 2} className="h-12 rounded-xl bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
          Search
        </button>
      </form>
    </div>
  );
}

function TypeInstead({ placeholder, onPick, disabled }: { placeholder?: string; onPick: Pick; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 inline-flex min-h-10 items-center gap-1.5 text-[14px] font-medium text-primary-ink hover:underline">
        <PenLine className="h-4 w-4" aria-hidden /> Type instead
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onPick(v.trim(), v.trim());
      }}
      className="flex gap-2"
    >
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder ?? "Type your answer"} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[16px] focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15" />
      <button type="submit" disabled={disabled || !v.trim()} className="h-11 rounded-xl bg-primary px-4 text-[15px] font-medium text-white disabled:opacity-50" aria-label="Send answer">
        <SendHorizontal className="h-4 w-4" />
      </button>
    </form>
  );
}

/** Renders a guided question with the right control for its style. Hidden once answered. */
export function QuestionCardView({ card }: { card: Card }) {
  const chat = useChat();
  const router = useRouter();
  if (card.status !== "open") return null;
  const pick: Pick = (value, reply) => {
    if (value.startsWith("open:")) return router.push(`/reports/${value.slice(5)}`);
    chat.send(reply, { key: card.key, value });
  };
  const p = { options: card.options, onPick: pick, disabled: chat.busy };
  let body: React.ReactNode;
  switch (card.style) {
    case "symptoms":
      body = <SymptomSelector {...p} />;
      break;
    case "body":
      body = card.key === "pain_location" ? <BodyMapPicker {...p} list={<BodyRegionSelector {...p} />} /> : <BodyRegionSelector {...p} />;
      break;
    case "duration":
      body = <DurationSelector {...p} />;
      break;
    case "scale":
      body = <PainScale {...p} />;
      break;
    case "yesno":
      body = <YesNoSelector {...p} />;
      break;
    case "multi":
      body = <MultiChoiceCard {...p} />;
      break;
    case "number":
      body = card.number ? (
        <div className="space-y-2.5">
          <InlineNumberInput spec={card.number} onPick={pick} disabled={chat.busy} />
          {card.options.length > 0 && <QuickReplyGroup {...p} label="Other answers" />}
        </div>
      ) : null;
      break;
    case "upload":
      body = <UploadChoice {...p} photo={card.key.startsWith("photo")} />;
      break;
    case "location":
      body = <LocationRequest onPick={pick} disabled={chat.busy} placeholder={card.textPlaceholder} />;
      break;
    default:
      body = <QuickReplyGroup {...p} />;
  }
  return (
    <div className="kw-in space-y-2">
      {body}
      {card.allowText && card.style !== "location" && <TypeInstead placeholder={card.textPlaceholder} onPick={pick} disabled={chat.busy} />}
    </div>
  );
}

/** Single-choice options (same control as quick replies; named for clarity where a question has one answer). */
export const SingleChoiceCard = QuickReplyGroup;
