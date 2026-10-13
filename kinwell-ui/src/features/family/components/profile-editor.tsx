import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/adapters/navigation";
import { Camera, Phone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { addEmergencyContactAction, deleteProfileAction, removeEmergencyContactAction, updateProfileAction, uploadProfilePhotoAction } from "@/api/family";
import { SPECIES_LABELS, type Profile } from "@/types/domain";

export function PhotoButton({ profileId }: { profileId: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} disabled={pending} className="absolute -bottom-1 -right-1 rounded-full border border-line bg-surface p-1.5 text-muted shadow-sm hover:text-ink" aria-label="Change profile photo">
        <Camera className="h-4 w-4" />
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Profile photo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("photo", f);
          start(async () => {
            const r = await uploadProfilePhotoAction(profileId, fd);
            if (!r.ok) setError(r.error);
            router.refresh();
          });
        }}
      />
      {error && <span className="sr-only" role="alert">{error}</span>}
    </>
  );
}

export function EditProfileButton({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ls = (profile.lifestyle ?? {}) as Record<string, string | number | undefined>;
  const ins = (profile.insurance ?? {}) as Record<string, string | undefined>;
  const pet = profile.relationship === "pet";
  const child = profile.relationship === "child";
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit profile
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Edit ${profile.display_name}`} description="Only the name is required.">
        <form
          className="space-y-4"
          action={(f) =>
            start(async () => {
              const g = (k: string) => (f.get(k) as string) ?? "";
              const r = await updateProfileAction(profile.id, {
                displayName: g("displayName"),
                relationship: g("relationship"),
                dateOfBirth: g("dateOfBirth") || null,
                sex: g("sex"),
                heightCm: g("heightCm"),
                weightKg: g("weightKg"),
                bloodGroup: g("bloodGroup"),
                pregnancyStatus: g("pregnancyStatus"),
                familyHistory: g("familyHistory"),
                previousSurgeries: g("previousSurgeries"),
                lifestyle: Object.fromEntries(Object.entries({ activityLevel: g("activityLevel"), diet: g("diet"), smoking: g("smoking"), alcohol: g("alcohol"), sleepGoalHours: g("sleepGoalHours"), bornWeeks: g("bornWeeks"), birthWeightKg: g("birthWeightKg"), feeding: g("feeding"), vaccinations: g("vaccinations") }).filter(([, v]) => v)),
                ...(pet ? { species: g("species"), breed: g("breed"), neutered: g("neutered") } : {}),
                insuranceProvider: g("insuranceProvider"),
                insurancePolicy: g("insurancePolicy"),
              });
              if (!r.ok) return setError(r.error);
              setOpen(false);
              router.refresh();
            })
          }
        >
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="ep-name" required className="col-span-2">
              <Input id="ep-name" name="displayName" defaultValue={profile.display_name} required />
            </Field>
            {pet ? (
              <>
                <input type="hidden" name="relationship" value="pet" />
                <Field label="Animal" htmlFor="ep-species">
                  <Select id="ep-species" name="species" defaultValue={profile.species ?? "dog"}>
                    {Object.entries(SPECIES_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Breed" htmlFor="ep-breed">
                  <Input id="ep-breed" name="breed" defaultValue={profile.breed ?? ""} placeholder="e.g. Labrador" />
                </Field>
                <Field label="Date of birth" htmlFor="ep-dob">
                  <Input id="ep-dob" name="dateOfBirth" type="date" defaultValue={profile.date_of_birth ?? ""} />
                </Field>
                <Field label="Sex" htmlFor="ep-sex">
                  <Select id="ep-sex" name="sex" defaultValue={profile.sex ?? ""}>
                    <option value="">Not specified</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </Select>
                </Field>
                <Field label="Neutered or spayed" htmlFor="ep-neut">
                  <Select id="ep-neut" name="neutered" defaultValue={profile.neutered == null ? "" : profile.neutered ? "yes" : "no"}>
                    <option value="">Not sure</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </Select>
                </Field>
                <Field label="Weight (kg)" htmlFor="ep-w">
                  <Input id="ep-w" name="weightKg" inputMode="decimal" defaultValue={profile.weight_kg ?? ""} />
                </Field>
                <Field label="Diet" htmlFor="ep-diet" className="col-span-2">
                  <Input id="ep-diet" name="diet" defaultValue={String(ls.diet ?? "")} placeholder="e.g. Dry food twice a day" />
                </Field>
                <Field label="Vaccinations and deworming" htmlFor="ep-vax" className="col-span-2">
                  <Input id="ep-vax" name="vaccinations" defaultValue={String(ls.vaccinations ?? "")} placeholder="e.g. Rabies and DHPP up to date, dewormed Aug 2026" />
                </Field>
              </>
            ) : (
              <>
            <Field label="Relationship" htmlFor="ep-rel">
              <Select id="ep-rel" name="relationship" defaultValue={profile.relationship} disabled={profile.relationship === "self"}>
                {["self", "mother", "father", "spouse", "child", "sibling", "grandparent", "other"].map((r) => (
                  <option key={r} value={r}>
                    {r === "self" ? "Myself" : r[0]!.toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </Select>
              {profile.relationship === "self" && <input type="hidden" name="relationship" value="self" />}
            </Field>
            <Field label="Date of birth" htmlFor="ep-dob">
              <Input id="ep-dob" name="dateOfBirth" type="date" defaultValue={profile.date_of_birth ?? ""} />
            </Field>
            <Field label="Sex" htmlFor="ep-sex">
              <Select id="ep-sex" name="sex" defaultValue={profile.sex ?? ""}>
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="intersex">Intersex</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </Select>
            </Field>
            <Field label="Blood group" htmlFor="ep-bg">
              <Select id="ep-bg" name="bloodGroup" defaultValue={profile.blood_group ?? ""}>
                <option value="">Unknown</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <Field label="Pregnancy" htmlFor="ep-preg" hint="(if relevant)">
              <Select id="ep-preg" name="pregnancyStatus" defaultValue={profile.pregnancy_status ?? ""}>
                <option value="">Not specified</option>
                <option value="not_pregnant">Not pregnant</option>
                <option value="pregnant">Pregnant</option>
                <option value="unknown">Unknown</option>
              </Select>
            </Field>
            {child && (
              <>
                <Field label="Born at (weeks)" htmlFor="ep-bw" hint="(40 = full term)">
                  <Input id="ep-bw" name="bornWeeks" inputMode="numeric" defaultValue={String(ls.bornWeeks ?? "")} placeholder="e.g. 39" />
                </Field>
                <Field label="Birth weight (kg)" htmlFor="ep-bwt">
                  <Input id="ep-bwt" name="birthWeightKg" inputMode="decimal" defaultValue={String(ls.birthWeightKg ?? "")} placeholder="e.g. 3.2" />
                </Field>
                <Field label="Feeding" htmlFor="ep-feed">
                  <Select id="ep-feed" name="feeding" defaultValue={String(ls.feeding ?? "")}>
                    <option value="">—</option>
                    <option value="breast">Breast milk</option>
                    <option value="formula">Formula</option>
                    <option value="mixed">Breast milk and formula</option>
                    <option value="solids">Solids</option>
                  </Select>
                </Field>
                <Field label="Vaccinations" htmlFor="ep-vax">
                  <Input id="ep-vax" name="vaccinations" defaultValue={String(ls.vaccinations ?? "")} placeholder="e.g. Up to date (6-week)" />
                </Field>
              </>
            )}
            <details className="col-span-2 rounded-xl border border-line px-3.5 py-2.5">
              <summary className="cursor-pointer text-[15px] font-medium text-primary-ink">More details (optional)</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Height (cm)" htmlFor="ep-h">
              <Input id="ep-h" name="heightCm" inputMode="decimal" defaultValue={profile.height_cm ?? ""} />
            </Field>
            <Field label="Weight (kg)" htmlFor="ep-w">
              <Input id="ep-w" name="weightKg" inputMode="decimal" defaultValue={profile.weight_kg ?? ""} />
            </Field>
            <Field label="Activity level" htmlFor="ep-act">
              <Select id="ep-act" name="activityLevel" defaultValue={String(ls.activityLevel ?? "")}>
                <option value="">—</option>
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </Select>
            </Field>
            <Field label="Diet" htmlFor="ep-diet">
              <Input id="ep-diet" name="diet" defaultValue={String(ls.diet ?? "")} placeholder="e.g. Vegetarian" />
            </Field>
            <Field label="Smoking" htmlFor="ep-smoke">
              <Select id="ep-smoke" name="smoking" defaultValue={String(ls.smoking ?? "")}>
                <option value="">—</option>
                <option value="never">Never</option>
                <option value="former">Former</option>
                <option value="current">Current</option>
              </Select>
            </Field>
            <Field label="Alcohol" htmlFor="ep-alc">
              <Select id="ep-alc" name="alcohol" defaultValue={String(ls.alcohol ?? "")}>
                <option value="">—</option>
                <option value="none">None</option>
                <option value="occasional">Occasional</option>
                <option value="regular">Regular</option>
              </Select>
            </Field>
            <Field label="Family medical history" htmlFor="ep-fh" className="col-span-2">
              <Textarea id="ep-fh" name="familyHistory" rows={2} className="min-h-0" defaultValue={profile.family_history ?? ""} />
            </Field>
            <Field label="Previous surgeries" htmlFor="ep-surg" className="col-span-2">
              <Textarea id="ep-surg" name="previousSurgeries" rows={2} className="min-h-0" defaultValue={profile.previous_surgeries ?? ""} />
            </Field>
            <Field label="Insurance provider" htmlFor="ep-ins" hint="(optional)">
              <Input id="ep-ins" name="insuranceProvider" defaultValue={ins.provider ?? ""} />
            </Field>
            <Field label="Policy number" htmlFor="ep-pol" hint="(optional)">
              <Input id="ep-pol" name="insurancePolicy" defaultValue={ins.policy ?? ""} />
            </Field>
            <Field label="Sleep goal (hours)" htmlFor="ep-sleep">
              <Input id="ep-sleep" name="sleepGoalHours" inputMode="decimal" defaultValue={String(ls.sleepGoalHours ?? "")} />
            </Field>
              </div>
            </details>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save profile
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function EmergencyContacts({ profileId, contacts }: { profileId: string; contacts: { id: string; name: string; relationship: string | null; phone: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", phone: "", relationship: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
        {contacts.length === 0 && <li className="px-4 py-5 text-center text-sm text-muted">No emergency contact yet.</li>}
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="text-[13px] text-muted">{[c.relationship, c.phone].filter(Boolean).join(" · ")}</p>
            </div>
            <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="rounded-lg p-2 text-primary-ink hover:bg-subtle" aria-label={`Call ${c.name}`}>
              <Phone className="h-4 w-4" />
            </a>
            <button type="button" onClick={() => start(async () => (await removeEmergencyContactAction(c.id), router.refresh()))} className="rounded-lg p-2 text-muted hover:bg-danger-bg hover:text-danger" aria-label={`Remove ${c.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-[15px] font-medium text-primary-ink hover:underline">
          <Plus className="h-4 w-4" aria-hidden /> Add emergency contact
        </button>
      ) : (
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addEmergencyContactAction(profileId, form);
            if (!r.ok) return setError(r.error);
            setForm({ name: "", phone: "", relationship: "" });
            setError(null);
            setAdding(false);
            router.refresh();
          });
        }}
      >
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" aria-label="Contact name" required />
        <Input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder="Relationship" aria-label="Relationship" />
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" type="tel" aria-label="Phone" required />
        <Button type="submit" loading={pending}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </Button>
      </form>
      )}
      <FormError message={error} />
    </div>
  );
}

export function DeleteProfile({ profileId, name, isSelf }: { profileId: string; name: string; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (isSelf) return <p className="text-sm text-muted">To delete your own profile, delete your account from Settings → Privacy.</p>;
  return (
    <>
      <Button variant="danger-outline" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" aria-hidden /> Delete {name}&apos;s profile
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Delete ${name}'s profile?`} description="This permanently deletes all of their reports, files, readings, medicines, conversations and doctor notes.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await deleteProfileAction(profileId, text);
              if (r && !r.ok) setError(r.error);
            });
          }}
        >
          <FormError message={error} />
          <Field label={`Type "${name}" to confirm`} htmlFor="del-confirm">
            <Input id="del-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending} disabled={text.trim().toLowerCase() !== name.toLowerCase()}>
              Delete permanently
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
