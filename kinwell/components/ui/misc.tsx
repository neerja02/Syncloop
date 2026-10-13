import { AlertTriangle, CheckCircle2, Info, OctagonAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { initials } from "@/lib/utils/format";

export function Card({ className, children, as: As = "div", ...rest }: { className?: string; children: React.ReactNode; as?: "div" | "section" | "article" | "li" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-soft)]", className)} {...rest}>
      {children}
    </As>
  );
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";
const toneClass: Record<Tone, string> = {
  neutral: "bg-subtle text-muted border-line",
  success: "bg-success-bg text-success border-success/20",
  warning: "bg-warning-bg text-warning border-warning/25",
  danger: "bg-danger-bg text-danger border-danger/25",
  info: "bg-info-bg text-info border-info/20",
  primary: "bg-accent-light/70 text-primary-dark border-primary/15",
};
const toneIcon: Partial<Record<Tone, LucideIcon>> = { success: CheckCircle2, warning: AlertTriangle, danger: OctagonAlert, info: Info };

/** Status pill: always icon + text + colour, never colour alone. */
export function Badge({ tone = "neutral", children, icon, className }: { tone?: Tone; children: React.ReactNode; icon?: LucideIcon | false; className?: string }) {
  const Icon = icon === false ? null : icon ?? toneIcon[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-5", toneClass[tone], className)}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

export function severityTone(sev: string | null | undefined): Tone {
  switch (sev) {
    case "EMERGENCY":
    case "HIGH":
      return "danger";
    case "MODERATE":
      return "warning";
    case "LOW":
      return "success";
    default:
      return "neutral";
  }
}

export function Avatar({ name, color, size = 32, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: color ?? "#3D83DF", fontSize: Math.max(11, size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] font-medium text-primary-ink">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-light/70 text-primary-ink">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("kw-skeleton rounded-lg", className)} aria-hidden />;
}

export function SectionTitle({ children, action, id }: { children: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 id={id} className="text-[15px] font-semibold text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border border-warning/30 bg-warning-bg px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning", className)} title="Fictional demo data">
      Demo
    </span>
  );
}

export function Stat({ label, value, unit, sub, className }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="tabular mt-0.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[13px] text-muted">{sub}</div>}
    </div>
  );
}
