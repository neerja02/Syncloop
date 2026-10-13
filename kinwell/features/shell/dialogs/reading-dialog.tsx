"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { addMeasurementAction } from "@/features/health/actions";
import { MEASUREMENT_SPEC } from "@/lib/validation/health";
import { useShell } from "../shell-context";

const TYPES = ["blood_glucose", "blood_pressure", "hba1c", "heart_rate", "temperature", "weight", "spo2", "sleep_duration", "steps"] as const;

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ReadingDialog({ profileId, type, onClose }: { profileId?: string; type?: string; onClose: () => void }) {
  const shell = useShell();
  const router = useRouter();
  const [kind, setKind] = useState<(typeof TYPES)[number]>((TYPES as readonly string[]).includes(type ?? "") ? (type as (typeof TYPES)[number]) : "blood_glucose");
  const [context, setContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const spec = MEASUREMENT_SPEC[kind];

  const submit = (form: FormData) => {
    const local = String(form.get("measuredAt") ?? "");
    const payload = {
      profileId: form.get("profileId"),
      measurementType: kind,
      value: form.get("value"),
      secondaryValue: kind === "blood_pressure" ? form.get("secondaryValue") : null,
      unit: kind === "blood_glucose" ? form.get("unit") : undefined,
      context: kind === "blood_glucose" ? context || null : null,
      minutesAfterMeal: kind === "blood_glucose" && context === "after_meal" ? form.get("minutesAfterMeal") || null : null,
      measuredAt: local ? new Date(local).toISOString() : undefined,
      notes: form.get("notes") || null,
      source: "manual",
    };
    start(async () => {
      const r = await addMeasurementAction(payload);
      if (!r.ok) {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add a reading" description="Saved directly to the selected person's record.">
      <form action={submit} className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="For" htmlFor="rd-profile">
            <Select id="rd-profile" name="profileId" defaultValue={profileId ?? shell.selectedProfileId}>
              {shell.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Measurement" htmlFor="rd-type">
            <Select id="rd-type" value={kind} onChange={(e) => setKind(e.target.value as (typeof TYPES)[number])}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEASUREMENT_SPEC[t].label}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "blood_pressure" ? (
            <>
              <Field label="Systolic (top)" htmlFor="rd-val" error={fieldErrors.value}>
                <Input id="rd-val" name="value" inputMode="numeric" required placeholder="120" className="tabular text-lg" />
              </Field>
              <Field label="Diastolic (bottom)" htmlFor="rd-val2" error={fieldErrors.secondaryValue}>
                <Input id="rd-val2" name="secondaryValue" inputMode="numeric" required placeholder="80" className="tabular text-lg" />
              </Field>
            </>
          ) : (
            <Field label={`Value (${kind === "blood_glucose" ? "mg/dL or mmol/L" : spec.unit})`} htmlFor="rd-val" error={fieldErrors.value} className={kind === "blood_glucose" ? "" : "sm:col-span-2"}>
              <Input id="rd-val" name="value" inputMode="decimal" required className="tabular text-lg" />
            </Field>
          )}
          {kind === "blood_glucose" && (
            <>
              <Field label="Unit" htmlFor="rd-unit">
                <Select id="rd-unit" name="unit" defaultValue="mg/dL">
                  <option>mg/dL</option>
                  <option>mmol/L</option>
                </Select>
              </Field>
              <Field label="When was it taken?" htmlFor="rd-ctx" error={fieldErrors.context} required className="sm:col-span-2">
                <div id="rd-ctx" role="radiogroup" className="flex flex-wrap gap-2">
                  {[
                    ["fasting", "Fasting"],
                    ["before_meal", "Before meal"],
                    ["after_meal", "After meal"],
                    ["random", "Random"],
                    ["bedtime", "Bedtime"],
                  ].map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={context === v} onClick={() => setContext(v!)} className={`rounded-full border px-3.5 py-1.5 text-sm ${context === v ? "border-primary bg-primary text-white" : "border-line hover:bg-subtle"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
              {context === "after_meal" && (
                <Field label="Minutes after eating" htmlFor="rd-min" className="sm:col-span-2">
                  <Select id="rd-min" name="minutesAfterMeal" defaultValue="120">
                    <option value="60">About 1 hour</option>
                    <option value="120">About 2 hours</option>
                    <option value="180">3 hours or more</option>
                  </Select>
                </Field>
              )}
            </>
          )}
          <Field label="Date & time" htmlFor="rd-at" error={fieldErrors.measuredAt} className="sm:col-span-2">
            <Input id="rd-at" name="measuredAt" type="datetime-local" defaultValue={localNow()} max={localNow()} />
          </Field>
          <Field label="Notes" htmlFor="rd-notes" hint="(optional)" className="sm:col-span-2">
            <Textarea id="rd-notes" name="notes" rows={2} className="min-h-0" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save reading
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
