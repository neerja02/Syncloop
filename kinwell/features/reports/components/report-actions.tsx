"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, ExternalLink, FolderPlus, MoreHorizontal, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useShell } from "@/features/shell/shell-context";
import { confirmResultAction, deleteFolderAction, deleteReportAction, enterResultAction, renameFolderAction, reportFileUrlAction, resolveMedicationResultAction, updateReportAction } from "../actions";

export function NewFolderButton() {
  const shell = useShell();
  return (
    <Button variant="secondary" onClick={() => shell.openDialog({ kind: "folder" })}>
      <FolderPlus className="h-4 w-4" aria-hidden /> New folder
    </Button>
  );
}

export function FolderMenu({ id, name, isDefault }: { id: string; name: string; isDefault: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <Menu>
      <MenuTrigger className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface hover:bg-subtle" aria-label="Folder options">
        <MoreHorizontal className="h-5 w-5" />
      </MenuTrigger>
      <MenuContent>
        <MenuItem
          onSelect={() => {
            const n = prompt("Rename folder", name);
            if (n && n.trim() && n !== name) start(async () => (await renameFolderAction(id, n), router.refresh()));
          }}
        >
          <Pencil className="h-4 w-4" /> Rename
        </MenuItem>
        {!isDefault && (
          <MenuItem
            danger
            onSelect={() => {
              if (confirm(`Delete the folder "${name}"? Reports inside are kept and moved to All reports.`)) start(async () => (await deleteFolderAction(id), router.push("/reports")));
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete folder
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}

export function OpenFileButtons({ reportId, hasEnhanced }: { reportId: string; hasEnhanced: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const open = (variant: "original" | "enhanced", download = false) =>
    start(async () => {
      const r = await reportFileUrlAction(reportId, variant, download);
      if (!r.ok || !r.data) return setError(r.ok ? "File not found" : r.error);
      window.open(r.data.url, "_blank", "noopener");
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => open("original")} loading={pending}>
        <ExternalLink className="h-4 w-4" aria-hidden /> Open original
      </Button>
      {hasEnhanced && (
        <Button size="sm" variant="secondary" onClick={() => open("enhanced")}>
          Enhanced copy
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => open("original", true)}>
        <Download className="h-4 w-4" aria-hidden /> Download
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function ResultConfirm({ id, valueText, value, unit, canonical, unreadable }: { id: string; valueText: string | null; value: number | null; unit: string | null; canonical: string | null; unreadable: boolean }) {
  const router = useRouter();
  const [manual, setManual] = useState(unreadable);
  const [v, setV] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-2 rounded-xl border border-warning/30 bg-warning-bg/50 p-3">
      {unreadable ? (
        <p className="text-sm">
          <span className="font-semibold">We couldn&apos;t reliably read the complete {canonical ?? "value"}.</span> The report shows “{valueText}”. We haven&apos;t guessed it.
        </p>
      ) : (
        <p className="text-sm">
          I can read this value as <span className="tabular font-semibold">{value} {unit}</span>. Please confirm.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {!unreadable && (
          <Button size="sm" loading={pending} onClick={() => start(async () => {
            const r = await confirmResultAction(id);
            if (!r.ok) return setError(r.error);
            router.refresh();
          })}>
            <Check className="h-4 w-4" aria-hidden /> Confirm {value}
          </Button>
        )}
        <UploadClearerButton />
        <Button size="sm" variant="secondary" onClick={() => setManual(!manual)}>
          Enter value manually
        </Button>
      </div>
      {manual && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await enterResultAction(id, v, unit ?? undefined);
              if (!r.ok) return setError(r.error);
              router.refresh();
            });
          }}
        >
          <Input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" placeholder={`Value from paper report${unit ? ` (${unit})` : ""}`} aria-label="Value from the paper report" className="h-9 max-w-[220px]" />
          <Button size="sm" type="submit" loading={pending}>
            Save
          </Button>
        </form>
      )}
      <FormError message={error} />
    </div>
  );
}

function UploadClearerButton() {
  const shell = useShell();
  return (
    <Button size="sm" variant="secondary" onClick={() => shell.openDialog({ kind: "camera" })}>
      <RefreshCcw className="h-4 w-4" aria-hidden /> Retake photo / upload clearer copy
    </Button>
  );
}

export function MedicationResultConfirm({ id, original, suggestion, alternatives }: { id: string; original: string; suggestion: string | null; alternatives: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [manual, setManual] = useState(false);
  const [name, setName] = useState("");
  const act = (d: { action: "accept" | "choose" | "manual" | "reject"; name?: string }) =>
    start(async () => {
      await resolveMedicationResultAction(id, d);
      router.refresh();
    });
  return (
    <div className="mt-2 rounded-xl border border-warning/30 bg-warning-bg/50 p-3">
      <p className="text-sm">
        The report says “{original}”. {suggestion ? <>Possible match: <span className="font-semibold">{suggestion}</span>. Did you mean {suggestion}?</> : "We couldn't match this name."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestion && (
          <Button size="sm" onClick={() => act({ action: "accept" })} loading={pending}>
            Yes, {suggestion}
          </Button>
        )}
        {alternatives.map((a) => (
          <Button key={a} size="sm" variant="secondary" onClick={() => act({ action: "choose", name: a })}>
            {a}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setManual(!manual)}>
          Enter manually
        </Button>
        <Button size="sm" variant="ghost" onClick={() => act({ action: "reject" })}>
          Not a medicine
        </Button>
      </div>
      {manual && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) act({ action: "manual", name });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Medicine name" aria-label="Medicine name" className="h-9 max-w-[240px]" />
          <Button size="sm" type="submit">
            Save
          </Button>
        </form>
      )}
    </div>
  );
}

export function ReportSettings({ report, profiles, folders }: { report: { id: string; title: string; profile_id: string; folder_id: string | null; report_date: string | null }; profiles: { id: string; display_name: string }[]; folders: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Menu>
        <MenuTrigger className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface hover:bg-subtle" aria-label="Report options">
          <MoreHorizontal className="h-5 w-5" />
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => setOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit details
          </MenuItem>
          <MenuItem
            danger
            onSelect={() => {
              if (confirm("Delete this report and its stored files permanently? This can't be undone.")) start(async () => (await deleteReportAction(report.id), router.push("/reports")));
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete report
          </MenuItem>
        </MenuContent>
      </Menu>
      <Dialog open={open} onOpenChange={setOpen} title="Report details">
        <form
          className="space-y-4"
          action={(f) =>
            start(async () => {
              const r = await updateReportAction(report.id, { title: String(f.get("title")), profileId: String(f.get("profileId")), folderId: (f.get("folderId") as string) || null, reportDate: (f.get("reportDate") as string) || null });
              if (!r.ok) return setError(r.error);
              setOpen(false);
              router.refresh();
            })
          }
        >
          <FormError message={error} />
          <Field label="Title" htmlFor="rp-title">
            <Input id="rp-title" name="title" defaultValue={report.title} required />
          </Field>
          <Field label="Belongs to" htmlFor="rp-prof" hint="(moving it updates every value and trend)">
            <Select id="rp-prof" name="profileId" defaultValue={report.profile_id}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Folder" htmlFor="rp-folder">
            <Select id="rp-folder" name="folderId" defaultValue={report.folder_id ?? ""}>
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Report date" htmlFor="rp-date">
            <Input id="rp-date" name="reportDate" type="date" defaultValue={report.report_date ?? ""} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function DeleteReportInline({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="danger-outline" size="sm" loading={pending} onClick={() => confirm("Delete this report permanently?") && start(async () => (await deleteReportAction(id), router.push("/reports")))}>
      <Trash2 className="h-4 w-4" aria-hidden /> Delete
    </Button>
  );
}
