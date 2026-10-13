import { useState, useTransition } from "react";
import { useRouter } from "@/adapters/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";
import { addAllergyAction, addConditionAction, deleteAllergyAction, deleteConditionAction, updateConditionStatusAction } from "@/api/health";
import type { Allergy, Condition } from "@/types/server";
import { formatDate } from "@/lib/utils/format";

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  return { pending, error, act };
}

export function ConditionsEditor({ profileId, conditions }: { profileId: string; conditions: Condition[] }) {
  const { pending, error, act } = useAct();
  const [name, setName] = useState("");
  return (
    <div>
      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
        {conditions.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No conditions recorded.</li>}
        {conditions.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="text-[13px] text-muted">
                {c.diagnosed_on ? `Since ${formatDate(c.diagnosed_on)} · ` : ""}
                Added by {c.source}
              </p>
            </div>
            <label className="sr-only" htmlFor={`st-${c.id}`}>
              Status for {c.name}
            </label>
            <Select id={`st-${c.id}`} className="h-9 w-36 text-sm" defaultValue={c.status} onChange={(e) => act(() => updateConditionStatusAction(c.id, e.target.value as "active"))}>
              <option value="active">Active</option>
              <option value="monitoring">Monitoring</option>
              <option value="resolved">Resolved</option>
            </Select>
            <button type="button" className="rounded-lg p-2 text-muted hover:bg-danger-bg hover:text-danger" aria-label={`Remove ${c.name}`} onClick={() => confirm(`Remove ${c.name}?`) && act(() => deleteConditionAction(c.id))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) act(() => addConditionAction({ profileId, name }), () => setName(""));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a condition (e.g. Asthma)" aria-label="New condition" />
        <Button type="submit" loading={pending}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </Button>
      </form>
      <FormError message={error} />
    </div>
  );
}

export function AllergiesEditor({ profileId, allergies }: { profileId: string; allergies: Allergy[] }) {
  const { pending, error, act } = useAct();
  const [form, setForm] = useState({ substance: "", reaction: "", severity: "unknown" });
  return (
    <div>
      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
        {allergies.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No allergies recorded.</li>}
        {allergies.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{a.substance}</p>
              <p className="text-[13px] text-muted">{a.reaction ?? "Reaction not recorded"}</p>
            </div>
            <Badge tone={a.severity === "severe" ? "danger" : a.severity === "moderate" ? "warning" : "neutral"}>{a.severity ?? "unknown"}</Badge>
            <button type="button" className="rounded-lg p-2 text-muted hover:bg-danger-bg hover:text-danger" aria-label={`Remove ${a.substance}`} onClick={() => confirm(`Remove allergy to ${a.substance}?`) && act(() => deleteAllergyAction(a.id))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.substance.trim()) act(() => addAllergyAction({ profileId, ...form }), () => setForm({ substance: "", reaction: "", severity: "unknown" }));
        }}
      >
        <Input value={form.substance} onChange={(e) => setForm({ ...form, substance: e.target.value })} placeholder="Allergy (e.g. Penicillin)" aria-label="Allergy" />
        <Input value={form.reaction} onChange={(e) => setForm({ ...form, reaction: e.target.value })} placeholder="Reaction (optional)" aria-label="Reaction" />
        <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} aria-label="Severity">
          <option value="unknown">Severity?</option>
          <option value="mild">Mild</option>
          <option value="moderate">Moderate</option>
          <option value="severe">Severe</option>
        </Select>
        <Button type="submit" loading={pending}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </Button>
      </form>
      <FormError message={error} />
    </div>
  );
}

