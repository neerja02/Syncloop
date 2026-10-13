"use client";
import { useEffect, useState } from "react";
import { MapPin, Phone, PhoneCall, Stethoscope, UserRound } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { getEmergencyConfig } from "@/lib/clinical/emergency-config";
import { emergencyContactsAction } from "./actions";
import { useShell } from "./shell-context";

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;
type Contact = { id: string; name: string; relationship: string | null; phone: string };

/**
 * Always-available emergency actions. Numbers come only from the verified country configuration for the
 * family's country — never guessed.
 */
export function EmergencyPanel({ onClose }: { onClose: () => void }) {
  const shell = useShell();
  const cfg = getEmergencyConfig(shell.countryCode);
  const profileId = shell.conversation?.profileId ?? shell.selectedProfileId;
  const person = shell.profiles.find((p) => p.id === profileId);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  useEffect(() => {
    let live = true;
    emergencyContactsAction(profileId).then((r) => live && setContacts(r.ok ? r.data ?? [] : []));
    return () => {
      live = false;
    };
  }, [profileId]);
  const row = "flex min-h-14 w-full items-center gap-3.5 rounded-2xl border px-4 text-left text-[15px] font-medium";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Emergency" description={`If someone's life may be in danger, call now. Numbers for ${cfg.countryName}.`} size="sm">
      <div className="space-y-2.5">
        <a href={tel(cfg.emergencyNumber)} className={`${row} border-danger bg-danger text-white hover:bg-[#b93636]`}>
          <PhoneCall className="h-5 w-5 shrink-0" aria-hidden />
          <span className="flex-1">Call Emergency Services</span>
          <span className="text-[17px] font-semibold tabular-nums">{cfg.emergencyNumber}</span>
        </a>
        {cfg.ambulanceNumber && (
          <a href={tel(cfg.ambulanceNumber)} className={`${row} border-danger/30 bg-surface hover:bg-danger-bg/50`}>
            <Phone className="h-5 w-5 shrink-0 text-danger" aria-hidden />
            <span className="flex-1">Ambulance</span>
            <span className="font-semibold tabular-nums">{cfg.ambulanceNumber}</span>
          </a>
        )}
        {contacts === null ? (
          <div className={`${row} border-line text-muted`}>
            <UserRound className="h-5 w-5 shrink-0" aria-hidden /> Loading emergency contact…
          </div>
        ) : contacts.length ? (
          contacts.slice(0, 2).map((c) => (
            <a key={c.id} href={tel(c.phone)} className={`${row} border-line bg-surface hover:bg-subtle`}>
              <UserRound className="h-5 w-5 shrink-0 text-danger" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate">Call {c.name}</span>
                <span className="block text-[13px] font-normal text-muted">{[c.relationship, c.phone].filter(Boolean).join(" · ")}</span>
              </span>
            </a>
          ))
        ) : (
          <a href={`/family/${profileId}#emergency-contacts`} onClick={onClose} className={`${row} border-dashed border-line bg-surface text-muted hover:bg-subtle`}>
            <UserRound className="h-5 w-5 shrink-0" aria-hidden /> Add an emergency contact{person ? ` for ${person.relationship === "self" ? "yourself" : person.display_name}` : ""}
          </a>
        )}
        {shell.myDoctor?.phone && (
          <a href={tel(shell.myDoctor.phone)} className={`${row} border-line bg-surface hover:bg-subtle`}>
            <Stethoscope className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden /> Call {shell.myDoctor.name}
          </a>
        )}
        <a href="https://www.google.com/maps/search/emergency+hospital+near+me" target="_blank" rel="noreferrer" className={`${row} border-line bg-surface hover:bg-subtle`}>
          <MapPin className="h-5 w-5 shrink-0 text-danger" aria-hidden /> Find Nearby Emergency Care
        </a>
        {cfg.crisisLine && (
          <p className="px-1 pt-1 text-[13px] text-muted">
            Mental health crisis: {cfg.crisisLine.label}{" "}
            <a href={tel(cfg.crisisLine.number)} className="font-semibold text-ink underline">
              {cfg.crisisLine.number}
            </a>
          </p>
        )}
      </div>
    </Dialog>
  );
}
