"use client";
import { useState } from "react";
import { AlertTriangle, MapPin, Phone, Share2, Stethoscope, UserRound } from "lucide-react";
import type { EmergencyCard as Card } from "@/lib/ai/types";
import { useShell } from "@/features/shell/shell-context";
import { useChat } from "../chat-context";

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

/**
 * Urgent / emergency interruption inside the active chat. Clear but not sensational: red accent, warning icon,
 * short copy, one large primary action. Numbers come only from the verified country configuration.
 */
export function EmergencyActionCard({ card }: { card: Card }) {
  const shell = useShell();
  const chat = useChat();
  const [shared, setShared] = useState<string | null>(null);
  const urgent = card.level === "urgent";
  const my = shell.myDoctor;
  const share = async () => {
    const res = await fetch(`/api/emergency-summary?profile=${card.profileId}`);
    const text = res.ok ? await res.text() : `Medical summary for ${card.profileName} unavailable.`;
    try {
      if (navigator.share) await navigator.share({ title: `Medical summary — ${card.profileName}`, text });
      else {
        await navigator.clipboard.writeText(text);
        setShared("Summary copied — paste it into a message to the doctor or family.");
      }
    } catch {
      /* user cancelled share */
    }
  };
  const mapsQuery = urgent ? "urgent care clinic near me" : "emergency hospital near me";
  if (card.audience === "vet") {
    return (
      <section role="alert" aria-live="assertive" className="kw-in overflow-hidden rounded-[var(--radius-card)] border border-danger/30 border-l-4 border-l-danger bg-surface">
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-[17px] font-semibold leading-snug text-ink">{card.title}</h3>
              <p className="mt-0.5 text-[15px] text-muted">{card.message}</p>
            </div>
          </div>
          {card.reasons.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-danger-bg/60 px-3.5 py-2.5 text-[14px]">
              {card.reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          )}
          <a href={`https://www.google.com/maps/search/${encodeURIComponent(urgent ? "veterinary clinic near me" : "emergency vet near me")}`} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-danger px-4 text-[16px] font-semibold text-white hover:bg-[#b93636]">
            <MapPin className="h-5 w-5" aria-hidden /> {urgent ? "Find a Vet Nearby" : "Find Emergency Vet Care"}
          </a>
          <p className="text-[14px] text-muted">If you have a regular vet, call them now. Don&apos;t give human medicines, and don&apos;t make your pet vomit unless a vet tells you to.</p>
        </div>
      </section>
    );
  }
  return (
    <section role="alert" aria-live="assertive" className="kw-in overflow-hidden rounded-[var(--radius-card)] border border-danger/30 border-l-4 border-l-danger bg-surface">
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold leading-snug text-ink">{card.title}</h3>
            <p className="mt-0.5 text-[15px] text-muted">{card.message}</p>
          </div>
        </div>
        {card.reasons.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-danger-bg/60 px-3.5 py-2.5 text-[14px]">
            {card.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2">
          {urgent ? (
            <button type="button" onClick={chat.callMyDoctor} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-danger px-4 text-[16px] font-semibold text-white hover:bg-[#b93636]">
              <Stethoscope className="h-5 w-5" aria-hidden /> {my?.phone ? `Call ${my.name}` : "Call My Doctor"}
            </button>
          ) : (
            <a href={tel(card.emergencyNumber)} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-danger px-4 text-[16px] font-semibold text-white hover:bg-[#b93636]">
              <Phone className="h-5 w-5" aria-hidden /> Call Emergency Services · {card.emergencyNumber}
            </a>
          )}
          <a href={`https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-danger/30 bg-surface px-4 text-[15px] font-medium hover:bg-danger-bg/50">
            <MapPin className="h-5 w-5 text-danger" aria-hidden /> {urgent ? "Find Urgent Care Nearby" : "Find Nearby Emergency Care"}
          </a>
          {urgent ? (
            <a href={tel(card.emergencyNumber)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-[15px] font-medium hover:bg-subtle">
              <Phone className="h-5 w-5 text-danger" aria-hidden /> If it gets worse, call {card.emergencyNumber}
            </a>
          ) : (
            <button type="button" onClick={chat.callMyDoctor} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-[15px] font-medium hover:bg-subtle">
              <Stethoscope className="h-5 w-5 text-primary-ink" aria-hidden /> {my?.phone ? `Call ${my.name}` : "Call My Doctor"}
            </button>
          )}
          {card.crisisLine && (
            <a href={tel(card.crisisLine.number)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-[15px] font-medium">
              <Phone className="h-5 w-5 text-danger" aria-hidden /> {card.crisisLine.label} · {card.crisisLine.number}
            </a>
          )}
          {card.emergencyContact && (
            <a href={tel(card.emergencyContact.phone)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-[15px] font-medium">
              <UserRound className="h-5 w-5 text-muted" aria-hidden /> Call {card.emergencyContact.name}
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <span>Numbers for {card.countryName}{card.ambulanceNumber ? ` · Ambulance ${card.ambulanceNumber}` : ""}</span>
          <button type="button" onClick={share} className="inline-flex min-h-9 items-center gap-1 font-medium text-primary-ink hover:underline">
            <Share2 className="h-3.5 w-3.5" aria-hidden /> Share medical summary
          </button>
        </div>
        {shared && <p className="text-sm" role="status">{shared}</p>}
      </div>
    </section>
  );
}

/** Back-compat name used by older messages. */
export const EmergencyCard = EmergencyActionCard;
