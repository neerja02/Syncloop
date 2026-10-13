"use client";
import { MapPin, Phone, Stethoscope, Video, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { DoctorRecommendationCard as RecCard, DoctorResultsCard } from "@/lib/ai/types";
import { useShell } from "@/features/shell/shell-context";
import { updateCardStatusAction } from "../../actions";
import { useChat } from "../chat-context";

const TIMING = { routine: "In the next few days", soon: "Within a day or two", urgent: "Today" } as const;

/** "You may want to speak with a …" — a doctor category, never a diagnosis. */
export function DoctorRecommendationCard({ card, messageId, isLast }: { card: RecCard; messageId: string; isLast: boolean }) {
  const chat = useChat();
  const shell = useShell();
  const my = shell.myDoctor;
  const dismissed = card.status === "dismissed";
  const vet = card.speciality === "Veterinarian";
  return (
    <section aria-label={`Suggested doctor: ${card.speciality}`} className="kw-in overflow-hidden rounded-[var(--radius-card)] border border-primary/20 bg-surface">
      <div className="flex items-start gap-3 bg-accent-light/70 px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-primary-ink">
          <Stethoscope className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{vet ? "You may want to see a" : "You may want to speak with a"}</p>
          <p className="text-[18px] font-semibold leading-tight text-primary-dark">{card.speciality}</p>
          <p className="mt-0.5 text-[13px] text-muted">{TIMING[card.timing]}</p>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3.5">
        <p className="text-[15px]">{card.reason}</p>
        {!dismissed && isLast && <p className="text-[15px] font-medium">{vet ? "Would you like me to help you find a vet nearby?" : "Would you like me to help you find a doctor nearby?"}</p>}
        {!dismissed && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" disabled={chat.busy} onClick={() => chat.findDoctor(card.speciality)} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
              <MapPin className="h-4 w-4" aria-hidden /> {vet ? "Find a Vet" : "Find a Doctor"}
            </button>
            {!vet && (
              <button type="button" onClick={chat.callMyDoctor} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 text-[15px] font-medium hover:bg-subtle">
                <Phone className="h-4 w-4" aria-hidden /> {my?.phone ? `Call ${my.name}` : my ? `Add ${my.name}'s phone` : "Call My Doctor"}
              </button>
            )}
            {isLast && (
              <button
                type="button"
                disabled={chat.busy}
                onClick={() => {
                  chat.patchCard(messageId, card.id, { status: "dismissed" });
                  void updateCardStatusAction(messageId, card.id, { status: "dismissed" });
                  chat.send("Not right now", { key: "doctor_not_now", value: card.speciality });
                }}
                className="inline-flex h-11 items-center justify-center rounded-full px-4 text-[15px] font-medium text-muted hover:bg-subtle hover:text-ink"
              >
                Not right now
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function DoctorResults({ card }: { card: DoctorResultsCard }) {
  return (
    <section aria-label={`${card.speciality} near ${card.locationLabel}`} className="kw-in space-y-2">
      <ul className="space-y-2">
        {card.results.map((d) => {
          const q = [d.clinic, d.address].filter(Boolean).join(", ");
          return (
            <li key={d.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{d.name}</p>
                  <p className="text-[14px] text-muted">{[d.speciality, d.clinic].filter(Boolean).join(" · ")}</p>
                </div>
                {d.distanceKm != null && <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[12px] font-medium text-muted tabular-nums">{d.distanceKm} km</span>}
              </div>
              <p className="mt-1.5 flex items-start gap-1.5 text-[14px] text-muted">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {d.address ?? "Address not listed"}
              </p>
              {(d.availability || d.consultationTypes.length > 0) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                  {d.availability && <span>{d.availability}</span>}
                  {d.consultationTypes.includes("teleconsultation") && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-light px-2 py-0.5 text-primary-ink">
                      <Video className="h-3.5 w-3.5" aria-hidden /> Video consult
                    </span>
                  )}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {d.phone && (
                  <a href={`tel:${d.phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-medium text-white hover:bg-primary-hover sm:flex-none">
                    <Phone className="h-4 w-4" aria-hidden /> Call
                  </a>
                )}
                {q && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-line px-4 text-[14px] font-medium hover:bg-subtle sm:flex-none">
                    <MapPin className="h-4 w-4" aria-hidden /> Directions
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <a href={card.mapsUrl} target="_blank" rel="noreferrer" className={cn("inline-flex min-h-10 items-center gap-1.5 text-[14px] font-medium text-primary-ink hover:underline")}>
        <ExternalLink className="h-4 w-4" aria-hidden /> More {card.speciality}s on Google Maps
      </a>
      {card.isDemo && <p className="text-[12px] text-muted">Demo directory with fictional listings. Always confirm details with the clinic.</p>}
    </section>
  );
}
