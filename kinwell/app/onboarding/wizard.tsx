"use client";
import { useState, useTransition } from "react";
import { Check, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { completeOnboarding } from "@/features/onboarding/actions";
import { cn } from "@/lib/utils/cn";

const STEPS = ["Welcome", "About you", "Health background", "Family"];
const RELS = [
  ["mother", "Mother"],
  ["father", "Father"],
  ["spouse", "Spouse"],
  ["child", "Child"],
  ["sibling", "Sibling"],
  ["grandparent", "Grandparent"],
  ["other", "Other"],
] as const;

function ChipInput({ label, values, onChange, placeholder, id }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; id: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <Input id={id} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => (e.key === "Enter" ? (e.preventDefault(), add()) : undefined)} />
        <Button type="button" variant="secondary" onClick={add} aria-label={`Add ${label.toLowerCase()}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {values.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-full border border-line bg-subtle py-1 pl-3 pr-1 text-sm">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-1 hover:bg-line" aria-label={`Remove ${v}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OnboardingWizard({ name, countries, emailVerified }: { name: string; countries: { code: string; name: string }[]; emailVerified: boolean }) {
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState({ displayName: name.split(" ")[0] ?? name, dateOfBirth: "", sex: "", countryCode: "IN" });
  const [conditions, setConditions] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [family, setFamily] = useState<{ name: string; relationship: (typeof RELS)[number][0]; dateOfBirth: string }[]>([]);
  const [aiConsent, setAiConsent] = useState(true);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = () =>
    start(async () => {
      setError(null);
      const res = await completeOnboarding({ ...profile, sex: profile.sex || undefined, conditions, allergies, medicines: [], family: family.filter((f) => f.name.trim()), permissions: { notifications: false, location: "not_asked", camera: false, aiConsent } });
      if (res?.error) setError(res.error);
    });

  return (
    <div className="min-h-dvh bg-page">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Logo />
        <span className="text-sm text-muted">
          Step {step + 1} of {STEPS.length}
        </span>
      </header>
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-8 flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-line")} />
          ))}
        </div>
        <main id="main" className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{step === 0 ? "Welcome to Kinwell" : STEPS[step]}</h1>
          <div className="mt-6 space-y-5">
            {step === 0 && (
              <>
                <p className="text-muted">Your personal health agent. Tell it what&apos;s bothering you, share reports, and get clear next steps — for you and your family.</p>
                <ul className="space-y-2.5 text-[15px]">
                  {["Everything is optional — share only what you want.", "Nothing is added to a medical record without your confirmation.", "Kinwell does not replace a doctor. In an emergency, call your local emergency number."].map((t) => (
                    <li key={t} className="flex gap-2.5">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
                {!emailVerified && <p className="rounded-xl bg-info-bg px-3.5 py-2.5 text-sm text-info">We sent you a verification email. You can continue now and verify later.</p>}
              </>
            )}
            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="ob-name" required className="sm:col-span-2">
                  <Input id="ob-name" value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} />
                </Field>
                <Field label="Date of birth" htmlFor="ob-dob" hint="(optional)">
                  <Input id="ob-dob" type="date" max={new Date().toISOString().slice(0, 10)} value={profile.dateOfBirth} onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })} />
                </Field>
                <Field label="Sex" htmlFor="ob-sex" hint="(optional, used where medically relevant)">
                  <Select id="ob-sex" value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })}>
                    <option value="">Prefer not to say</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="intersex">Intersex</option>
                  </Select>
                </Field>
                <Field label="Country" htmlFor="ob-country" hint="(for emergency numbers)" className="sm:col-span-2">
                  <Select id="ob-country" value={profile.countryCode} onChange={(e) => setProfile({ ...profile, countryCode: e.target.value })}>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            {step === 2 && (
              <>
                <p className="text-muted">Optional — this helps Kinwell avoid asking things it already knows.</p>
                <ChipInput id="ob-cond" label="Known conditions" values={conditions} onChange={setConditions} placeholder="e.g. Type 2 diabetes" />
                <ChipInput id="ob-all" label="Allergies" values={allergies} onChange={setAllergies} placeholder="e.g. Penicillin" />
              </>
            )}
            {step === 3 && (
              <>
                <p className="text-muted">Add people you care for. Each person gets a separate, private health profile.</p>
                {family.map((f, i) => (
                  <div key={i} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_160px_160px_auto]">
                    <Input aria-label="Name" placeholder="Name (e.g. Mom)" value={f.name} onChange={(e) => setFamily(family.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Select aria-label="Relationship" value={f.relationship} onChange={(e) => setFamily(family.map((x, j) => (j === i ? { ...x, relationship: e.target.value as typeof f.relationship } : x)))}>
                      {RELS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                    <Input aria-label="Date of birth (optional)" type="date" value={f.dateOfBirth} onChange={(e) => setFamily(family.map((x, j) => (j === i ? { ...x, dateOfBirth: e.target.value } : x)))} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove person" onClick={() => setFamily(family.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={() => setFamily([...family, { name: "", relationship: "mother", dateOfBirth: "" }])}>
                  <Plus className="h-4 w-4" /> Add a family member
                </Button>
                <label className="flex items-start gap-3 rounded-xl border border-line p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
                  <span className="flex-1 text-sm">
                    <span className="block text-[15px] font-medium">AI processing</span>
                    <span className="text-muted">Only the information needed to answer each question is sent to the AI service. Required for Kinwell to work.</span>
                  </span>
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-primary)]" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />
                </label>
              </>
            )}
            <FormError message={error} />
          </div>
          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button variant="ghost" onClick={back} type="button">
                Back
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {step === 2 && (
                <Button variant="secondary" type="button" onClick={next}>
                  Skip
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={next} disabled={step === 1 && !profile.displayName.trim()}>
                  {step === 0 ? "Get started" : "Continue"}
                </Button>
              ) : (
                <Button type="button" onClick={finish} loading={pending}>
                  Start using Kinwell
                </Button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
