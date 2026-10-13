import { AlertTriangle, CalendarClock, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { CareLevelCard } from "@/lib/ai/types";

const LEVELS = {
  emergency: { label: "Emergency now", icon: AlertTriangle, cls: "border-danger/30 bg-danger-bg text-danger" },
  same_day: { label: "Same-day care", icon: Clock, cls: "border-warning-accent/40 bg-warning-bg text-warning" },
  clinician: { label: "See a doctor", vet: "See a vet", icon: CalendarClock, cls: "border-primary/25 bg-accent-light text-primary-dark" },
  monitor: { label: "Safe to monitor with precautions", icon: ShieldCheck, cls: "border-success/25 bg-success-bg text-success" },
} as const;

/** "Emergency now · Same-day care · See a doctor/vet · Safe to monitor with precautions" — always one of these. */
export function CareLevelBadge({ card }: { card: CareLevelCard }) {
  const l = LEVELS[card.level];
  const label = card.audience === "vet" && card.level === "clinician" ? LEVELS.clinician.vet : card.audience === "vet" && card.level === "same_day" ? "Same-day vet care" : card.audience === "vet" && card.level === "emergency" ? "Emergency vet care now" : l.label;
  return (
    <div className={cn("kw-in inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[14px] font-semibold", l.cls)} role="status">
      <l.icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        <span className="sr-only">Care level: </span>
        {label}
      </span>
    </div>
  );
}
