import { useState, useTransition } from "react";
import { useRouter } from "@/adapters/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { saveMyDoctorAction } from "@/api/my-doctor";

export interface MyDoctorFormValues {
  name: string;
  specialisation: string | null;
  clinic_name: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  consultation_hours: string | null;
  emergency_phone: string | null;
  notes: string | null;
  last_visit_date: string | null;
  next_follow_up: string | null;
}

const SPECIALITIES = ["General Physician", "Family Medicine", "Paediatrician", "Gynaecologist", "Cardiologist", "Diabetologist", "Gastroenterologist", "Orthopaedic Doctor", "Neurologist", "Dermatologist", "ENT Specialist"];

/** Add / edit the family's regular doctor. Deliberately short: only the name is required. */
export function MyDoctorFormDialog({ initial, onClose }: { initial?: Partial<MyDoctorFormValues> | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [more, setMore] = useState(!!(initial?.alt_phone || initial?.email || initial?.emergency_phone || initial?.consultation_hours || initial?.notes || initial?.last_visit_date || initial?.next_follow_up));

  const submit = (form: FormData) => {
    const data = Object.fromEntries(form.entries());
    start(async () => {
      const r = await saveMyDoctorAction(data);
      if (!r.ok) {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
        return;
      }
      onClose();
      router.refresh();
    });
  };
  const v = (k: keyof MyDoctorFormValues) => initial?.[k] ?? "";
  const text = (k: keyof MyDoctorFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, className?: string) => (
    <Field label={label} htmlFor={`md-${k}`} error={fieldErrors[k]} className={className} hint={props.required ? undefined : "(optional)"} required={props.required}>
      <Input id={`md-${k}`} name={k} defaultValue={v(k) ?? ""} aria-invalid={!!fieldErrors[k]} {...props} />
    </Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()} title={initial?.name ? "Edit doctor details" : "Add your doctor"} description="Only you and your family can see this.">
      <form action={submit} className="space-y-4">
        <FormError message={error} />
        {text("name", "Doctor's name", { required: true, placeholder: "e.g. Dr. Amit Sharma", autoComplete: "off" })}
        <Field label="Specialisation" htmlFor="md-specialisation" hint="(optional)">
          <Input id="md-specialisation" name="specialisation" list="md-specs" defaultValue={v("specialisation") ?? ""} placeholder="e.g. General Physician" />
          <datalist id="md-specs">
            {SPECIALITIES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        {text("clinic_name", "Clinic / hospital", { placeholder: "e.g. Apollo Clinic" })}
        {text("phone", "Phone number", { type: "tel", inputMode: "tel", placeholder: "+91 …", autoComplete: "off" })}
        {text("address", "Clinic address", { placeholder: "Street, area" })}
        <div className="grid grid-cols-2 gap-3">
          {text("city", "City")}
          {text("pincode", "Pincode", { inputMode: "numeric" })}
          {text("state", "State", {}, "col-span-2")}
        </div>

        {more ? (
          <div className="space-y-4 border-t border-line pt-4">
            {text("alt_phone", "Alternate phone", { type: "tel", inputMode: "tel" })}
            {text("emergency_phone", "Emergency contact number", { type: "tel", inputMode: "tel" })}
            {text("email", "Email", { type: "email", inputMode: "email" })}
            {text("consultation_hours", "Consultation hours", { placeholder: "e.g. Mon–Sat, 10am–1pm" })}
            <div className="grid grid-cols-2 gap-3">
              {text("last_visit_date", "Last visit", { type: "date" })}
              {text("next_follow_up", "Next follow-up", { type: "date" })}
            </div>
            <Field label="Notes" htmlFor="md-notes" hint="(optional)">
              <Textarea id="md-notes" name="notes" defaultValue={v("notes") ?? ""} placeholder="Anything useful to remember" />
            </Field>
          </div>
        ) : (
          <button type="button" onClick={() => setMore(true)} className="text-[15px] font-medium text-primary-ink hover:underline">
            + Add more details
          </button>
        )}
        {!more && (
          <>
            <input type="hidden" name="alt_phone" value={v("alt_phone") ?? ""} />
            <input type="hidden" name="emergency_phone" value={v("emergency_phone") ?? ""} />
            <input type="hidden" name="email" value={v("email") ?? ""} />
            <input type="hidden" name="consultation_hours" value={v("consultation_hours") ?? ""} />
            <input type="hidden" name="last_visit_date" value={v("last_visit_date") ?? ""} />
            <input type="hidden" name="next_follow_up" value={v("next_follow_up") ?? ""} />
            <input type="hidden" name="notes" value={v("notes") ?? ""} />
          </>
        )}
        <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-line bg-surface px-5 pt-3">
          <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" loading={pending}>
            Save doctor
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
