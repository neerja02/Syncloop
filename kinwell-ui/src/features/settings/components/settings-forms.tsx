import { useState, useTransition } from "react";
import { useRouter } from "@/adapters/navigation";
import { Download, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";
import { changePasswordAction, deleteAccountAction, setConsentAction, signOutEverywhereAction, updateAccountAction } from "@/api/settings";
import { resendVerificationAction } from "@/api/auth";

function Toggle({ label, description, checked, onChange, id }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <label htmlFor={id} className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </label>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

function useSaver() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = (fn: () => Promise<{ ok: boolean; error?: string }>, okText = "Saved") =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Couldn't save" });
      router.refresh();
    });
  const Status = () => (msg ? <p role="status" className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null);
  return { pending, save, Status };
}

export function AccountForm({ name, email, country, verified }: { name: string; email: string; country: string; verified: boolean }) {
  const { pending, save, Status } = useSaver();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Card className="p-5">
        <form className="space-y-4" action={(f) => save(() => updateAccountAction({ fullName: String(f.get("fullName")), countryCode: country }))}>
          <Field label="Full name" htmlFor="acct-name">
            <Input id="acct-name" name="fullName" defaultValue={name} required />
          </Field>
          <Field label="Email" htmlFor="acct-email" hint={verified ? "(verified)" : "(not verified)"}>
            <Input id="acct-email" value={email} disabled />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending}>
              Save
            </Button>
            {!verified && (
              <Button type="button" variant="secondary" onClick={() => save(async () => {
                const r = await resendVerificationAction();
                return r?.ok ? { ok: true } : { ok: false, error: r?.error ?? undefined };
              }, "Verification email sent")}>
                Resend verification email
              </Button>
            )}
          </div>
        </form>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold">Change password</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save(async () => {
              const r = await changePasswordAction(pw.current, pw.next);
              if (r.ok) setPw({ current: "", next: "" });
              else setError(r.error);
              return r;
            }, "Password changed");
          }}
        >
          <Input type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <Input type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <Button type="submit" variant="secondary" loading={pending}>
            Update
          </Button>
        </form>
        <FormError message={error} />
      </Card>
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Sessions</h3>
          <p className="text-sm text-muted">Sign out of Kinwell on every device.</p>
        </div>
        <Button variant="secondary" onClick={() => void signOutEverywhereAction()}>
          <LogOut className="h-4 w-4" aria-hidden /> Sign out everywhere
        </Button>
      </Card>
      <Status />
    </>
  );
}

export function PrivacyControls({ consents }: { consents: Record<string, boolean> }) {
  const { pending, save, Status } = useSaver();
  const [c, setC] = useState(consents);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Card className="divide-y divide-line px-5 py-1">
        <h3 className="py-3 font-semibold">Consents</h3>
        <Toggle id="c-ai" label="AI processing" description="Required for the assistant. Only information needed for each question is sent to the AI provider." checked={c.ai_processing !== false} onChange={(v) => (setC({ ...c, ai_processing: v }), save(() => setConsentAction("ai_processing", v)))} />
        <Toggle id="c-res" label="Anonymous product research" description="Off by default." checked={!!c.research} onChange={(v) => (setC({ ...c, research: v }), save(() => setConsentAction("research", v)))} />
      </Card>
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Export your data</h3>
          <p className="text-sm text-muted">Download everything stored for your family as a JSON file.</p>
        </div>
        <a href="/api/export" className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-btn)] border border-line bg-surface px-4 text-sm font-medium hover:bg-subtle">
          <Download className="h-4 w-4" aria-hidden /> Export data
        </a>
      </Card>
      <Card className="border-danger/25 p-5">
        <h3 className="font-semibold text-danger">Delete account</h3>
        <p className="mt-1 text-sm text-muted">Permanently deletes your account. If you&apos;re the only admin of your family, every profile, report, file and conversation in it is deleted too. This can&apos;t be undone.</p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            save(async () => {
              const r = await deleteAccountAction(confirm);
              if (r && !r.ok) setError(r.error);
              return r ?? { ok: true };
            });
          }}
        >
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder='Type "DELETE" to confirm' aria-label="Type DELETE to confirm" />
          <Button type="submit" variant="danger" disabled={confirm !== "DELETE"} loading={pending}>
            Delete my account
          </Button>
        </form>
        <FormError message={error} />
      </Card>
      <Status />
    </>
  );
}
