import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/adapters/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { uploadReportAction } from "@/api/reports";
import { formatBytes } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { useShell } from "../shell-context";
import type { ReportCallback } from "../types";

const STATUS = ["Uploading securely…", "Checking image quality…", "Reading your report…", "Matching medical terms…", "Comparing with earlier results…"];

export function UploadDialog({ profileId, folderId, purpose, initialFile, onUploaded, onClose }: { profileId?: string; folderId?: string; purpose?: string; initialFile?: File; onUploaded?: ReportCallback; onClose: () => void }) {
  const shell = useShell();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [stage, setStage] = useState(0);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (form: FormData) => {
    if (!file) return setError("Choose a file to upload.");
    form.set("file", file);
    if (purpose) form.set("purpose", purpose);
    setError(null);
    const timer = setInterval(() => setStage((s) => Math.min(STATUS.length - 1, s + 1)), 900);
    start(async () => {
      const r = await uploadReportAction(form);
      clearInterval(timer);
      if (!r.ok) {
        setStage(0);
        return setError(r.error);
      }
      onClose();
      if (onUploaded) onUploaded({ id: r.data!.reportId, title: String(form.get("title") || file.name.replace(/\.[a-z0-9]+$/i, "")), profileId: r.data!.profileId, purpose });
      else router.push(`/reports/${r.data!.reportId}`);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()} title="Upload a report" description="PDF, JPG, PNG, HEIC or TXT · up to 15 MB. The original is always kept, privately.">
      {pending ? (
        <div className="flex flex-col items-center py-10 text-center" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-primary-ink" aria-hidden />
          <p className="mt-4 font-medium">{STATUS[stage]}</p>
          <p className="mt-1 text-sm text-muted">We never guess values we can&apos;t read clearly.</p>
        </div>
      ) : (
        <form action={submit} className="space-y-4">
          <FormError message={error} />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
            className={cn("flex flex-col items-center justify-center rounded-[14px] border-2 border-dashed px-4 py-8 text-center transition-colors", drag ? "border-primary bg-accent-light/40" : "border-line")}
          >
            <FileUp className="h-8 w-8 text-primary-ink" aria-hidden />
            {file ? (
              <p className="mt-3 text-sm">
                <span className="font-medium">{file.name}</span> <span className="text-muted">· {formatBytes(file.size)}</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">Drag a file here, or</p>
            )}
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => inputRef.current?.click()}>
              {file ? "Choose a different file" : "Choose file"}
            </Button>
            <input ref={inputRef} type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.txt,application/pdf,image/*,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Report file" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Who the report belongs to decides whose record it joins. */}
            <Field label="Whose report is this?" htmlFor="up-profile" required>
              <Select id="up-profile" name="profileId" defaultValue={profileId ?? shell.selectedProfileId} required>
                {shell.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Folder" htmlFor="up-folder" hint="(optional)">
              <Select id="up-folder" name="folderId" defaultValue={folderId ?? ""}>
                <option value="">Sort automatically</option>
                {shell.folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" htmlFor="up-title" hint="(optional)" className="sm:col-span-2">
              <Input id="up-title" name="title" placeholder="e.g. CBC September 2026" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!file}>
              Upload &amp; analyse
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
