"use client";
import { useEffect, useState } from "react";
import { Camera, ChevronRight, FileText, FolderOpen, Loader2, Upload } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils/format";
import { listReportsForPickerAction } from "@/features/reports/actions";
import { useShell } from "../shell-context";
import type { ReportCallback } from "../types";

function SheetRow({ icon: Icon, label, sub, onClick }: { icon: typeof Camera; label: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3.5 rounded-xl px-2 text-left hover:bg-subtle">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-light text-primary-ink">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {sub && <span className="block text-[13px] text-muted">{sub}</span>}
      </span>
      <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
    </button>
  );
}

/** The composer's "+" sheet: Take Photo · Upload Report · Choose Existing Report. */
export function AttachSheet({ profileId, onUploaded, onPicked, onClose }: { profileId: string; onUploaded?: ReportCallback; onPicked?: ReportCallback; onClose: () => void }) {
  const shell = useShell();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add to this chat" size="sm">
      <div className="-mx-2 space-y-1">
        <SheetRow icon={Camera} label="Take Photo" sub="A report, prescription or medicine label" onClick={() => shell.openDialog({ kind: "camera", profileId, onUploaded })} />
        <SheetRow icon={Upload} label="Upload Report" sub="PDF or image from your phone" onClick={() => shell.openDialog({ kind: "upload", profileId, onUploaded })} />
        {onPicked && <SheetRow icon={FolderOpen} label="Choose Existing Report" sub="From your saved reports" onClick={() => shell.openDialog({ kind: "pick_report", profileId, onPicked })} />}
      </div>
    </Dialog>
  );
}

type Item = { id: string; title: string; date: string; folder: string | null; status: string };

export function PickReportSheet({ profileId, onPicked, onClose }: { profileId: string; onPicked: ReportCallback; onClose: () => void }) {
  const shell = useShell();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = shell.profiles.find((p) => p.id === profileId);
  useEffect(() => {
    let live = true;
    listReportsForPickerAction(profileId).then((r) => {
      if (!live) return;
      if (r.ok) setItems(r.data ?? []);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [profileId]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Choose a report" description={name ? `Saved reports for ${name.relationship === "self" ? "you" : name.display_name}` : undefined} size="sm">
      {error && <p className="text-sm text-danger">{error}</p>}
      {!items && !error && (
        <p className="flex items-center gap-2 py-6 text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading reports…
        </p>
      )}
      {items?.length === 0 && (
        <div className="py-6 text-center">
          <p className="text-muted">No saved reports yet.</p>
          <button type="button" className="mt-3 font-medium text-primary-ink hover:underline" onClick={() => shell.openDialog({ kind: "upload", profileId, onUploaded: onPicked })}>
            Upload one now
          </button>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="-mx-2 space-y-0.5">
          {items.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPicked({ id: r.id, title: r.title, profileId });
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-subtle"
              >
                <FileText className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="block text-[13px] text-muted">
                    {formatDate(r.date)}
                    {r.folder ? ` · ${r.folder}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
