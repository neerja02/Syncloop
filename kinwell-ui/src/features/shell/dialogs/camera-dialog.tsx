import { useRef, useState } from "react";
import { Camera, FileText, Pill, ScanLine, Bandage, CircleHelp, Stethoscope, Eye, PawPrint, Smile, Hand, Scissors } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useShell } from "../shell-context";
import type { ReportCallback } from "../types";

const PURPOSES = [
  { key: "report", label: "Medical report", icon: FileText, folder: "Blood Tests" },
  { key: "prescription", label: "Prescription", icon: ScanLine, folder: "Prescriptions" },
  { key: "medicine_label", label: "Medicine label", icon: Pill, folder: "Prescriptions" },
  { key: "skin", label: "Skin concern", icon: Stethoscope, folder: null },
  { key: "injury", label: "Wound or injury", icon: Bandage, folder: null },
  { key: "eye", label: "Eye", icon: Eye, folder: null },
  { key: "throat", label: "Throat or mouth", icon: Smile, folder: null },
  { key: "nail", label: "Nails", icon: Hand, folder: null },
  { key: "scalp", label: "Scalp or hair", icon: Scissors, folder: null },
  { key: "pet", label: "My pet", icon: PawPrint, folder: null },
  { key: "other", label: "Other", icon: CircleHelp, folder: null },
] as const;

/** Camera flow: always asks the purpose first. Photos of skin/injuries are stored and sent to the doctor, never "diagnosed". */
export function CameraDialog({ profileId, onUploaded, onClose }: { profileId?: string; onUploaded?: ReportCallback; onClose: () => void }) {
  const shell = useShell();
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="What would you like me to look at?" description="Choose what you're photographing so it's handled the right way.">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {PURPOSES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setPurpose(p);
              setTimeout(() => input.current?.click(), 0);
            }}
            className="flex flex-col items-center gap-2 rounded-[14px] border border-line px-3 py-4 text-center text-sm font-medium hover:border-primary hover:bg-accent-light/30"
          >
            <p.icon className="h-6 w-6 text-primary-ink" aria-hidden />
            {p.label}
          </button>
        ))}
      </div>
      {purpose && ["skin", "injury", "eye", "throat", "nail", "scalp", "pet", "other"].includes(purpose.key) && (
        <p className="mt-4 rounded-xl bg-info-bg px-3.5 py-2.5 text-sm text-info">
          Kinwell describes only what it can see and asks a few questions — it never diagnoses from a photo. The photo is stored privately.
        </p>
      )}
      <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
        <Camera className="h-4 w-4" aria-hidden /> On phones this opens the camera; on computers you can choose an image.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Take photo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f || !purpose) return;
          const folder = shell.folders.find((x) => x.name === purpose.folder);
          const renamed = new File([f], `${purpose.label} photo ${new Date().toISOString().slice(0, 10)}.${f.name.split(".").pop() ?? "jpg"}`, { type: f.type });
          shell.openDialog({ kind: "upload", profileId, folderId: folder?.id, purpose: purpose.key, file: renamed, onUploaded });
        }}
      />
    </Dialog>
  );
}
