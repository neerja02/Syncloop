"use client";
import { Activity, Droplet, Info } from "lucide-react";
import { Badge, severityTone } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { TrendChart } from "@/components/charts/trend-chart";
import type { MeasurementResultCard } from "@/lib/ai/types";
import { useChat } from "../chat-context";

export function MeasurementCard({ card, messageId }: { card: MeasurementResultCard; messageId: string }) {
  const chat = useChat();
  const isBp = card.measurementType === "blood_pressure";
  const Icon = isBp ? Activity : Droplet;
  return (
    <section className="overflow-hidden rounded-[14px] border border-line bg-surface" aria-label={`${isBp ? "Blood pressure" : "Blood glucose"} result`}>
      <div className="grid gap-4 border-b border-line p-4 sm:grid-cols-[auto_1fr] sm:p-5">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">
            <Icon className="h-4 w-4 text-primary-ink" aria-hidden /> {isBp ? "Blood pressure" : "Blood glucose"}
          </div>
          <div className="tabular mt-1 flex items-baseline gap-1.5">
            <span className="text-[40px] font-semibold leading-none tracking-tight">
              {card.value}
              {isBp && card.secondaryValue != null ? `/${card.secondaryValue}` : ""}
            </span>
            <span className="text-base text-muted">{card.unit}</span>
          </div>
          <div className="mt-1 text-sm text-muted">{card.contextLabel}</div>
        </div>
        <div className="sm:border-l sm:border-line sm:pl-5">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">Status</div>
          <div className="mt-1.5">
            <Badge tone={severityTone(card.severity)}>{card.statusLabel}</Badge>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[12px] text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {card.rule ? `Determined through approved clinical configuration · rule ${card.rule.key} v${card.rule.version}` : "No approved rule matched this situation."}
          </p>
        </div>
      </div>
      <div className="space-y-4 p-4 text-[15px] sm:p-5">
        <div>
          <h4 className="font-semibold">What this means</h4>
          <p className="mt-1 text-muted">{card.sections.meaning}</p>
        </div>
        <div>
          <h4 className="font-semibold">Your recent trend</h4>
          <p className="mt-1 text-sm text-muted">{card.trend.summary}</p>
          {card.trend.points.length > 1 && (
            <div className="mt-2">
              <TrendChart points={card.trend.points} unit={card.unit} label={isBp ? "Systolic" : "Glucose"} secondaryLabel="Diastolic" height={150} compact />
            </div>
          )}
        </div>
        {card.doctorGuidance.length > 0 && (
          <div className="rounded-xl border border-primary/15 bg-accent-light/40 p-3.5">
            <h4 className="text-sm font-semibold text-primary-dark">Doctor&apos;s relevant guidance</h4>
            <ul className="mt-2 space-y-2.5">
              {card.doctorGuidance.map((g, i) => (
                <li key={i} className="text-sm">
                  <p>&ldquo;{g.text}&rdquo;</p>
                  <p className="mt-0.5 text-[12px] text-muted">{g.source}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="font-semibold">What you can do now</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
              {card.sections.whatYouCanDo.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold">Symptoms to watch</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
              {card.sections.symptomsToWatch.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <h4 className="font-semibold">When to contact your doctor</h4>
          <p className="mt-1 text-sm text-muted">{card.sections.whenToContact}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line bg-page/60 p-3 sm:px-5">
        {card.actions.map((a) => (
          <Button key={a.label} size="sm" variant={a.kind === "send_review" ? "primary" : "secondary"} onClick={() => chat.runAction(a, messageId)} disabled={chat.busy}>
            {a.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
