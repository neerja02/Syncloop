import { useRef, useState } from "react";
import { buildPlan, CONDITIONS, FREQ_ORDER, SLOTS } from "../../domain/catalog";
import { visitText } from "../../domain/health";
import { EMPTY_PROFILE, sampleProfile } from "../../domain/samples";
import type { AlertKey, Channel, Profile, Slot } from "../../domain/types";
import { useStore } from "../../store/useStore";
import { Avatar, ChannelBadge, Icon } from "../ui/ui";
import { ContactsEditor } from "../ui/ContactsEditor";

const STEPS = [
  ["Who is Nia caring for?", "The basics, and who in the family Nia should contact."],
  ["Health conditions", "Nia uses these to decide which readings to collect."],
  ["Doctors and medicines", "Add each doctor, or scan a prescription."],
  ["The care plan", "What Nia will check, how often, and how she asks."],
  ["How Nia checks in", "Daily call time, reminders, and when to alert family."],
] as const;

function Field({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {id ? <label htmlFor={id} className="text-[15px] font-bold">{label}</label> : <span className="text-[15px] font-bold">{label}</span>}
      {children}
    </div>
  );
}

function Picks<T extends string>({ options, value, onToggle }: { options: readonly T[]; value: T[] | T; onToggle: (v: T) => void }) {
  const on = (o: T) => (Array.isArray(value) ? value.includes(o) : value === o);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={on(o)} onClick={() => onToggle(o)} className={`rounded-full border-[1.5px] px-3.5 py-2 text-[15px] ${on(o) ? "border-accent bg-accent-soft font-bold text-accent" : "border-line bg-surface2"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function Wizard() {
  const { people, obEdit, baseDate, addPerson, saveProfile, setOverlay, showToast } = useStore();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [d, setD] = useState<Profile>(() => structuredClone(obEdit === null ? EMPTY_PROFILE : people[obEdit].pr));
  const body = useRef<HTMLDivElement>(null);
  const up = (fn: (x: Profile) => void) => setD((prev) => { const n = structuredClone(prev); fn(n); return n; });

  const used = people.map((p) => p.pr.first);
  const sampleKey = !used.includes("Ramesh") ? "ramesh" : !used.includes("Kamla") ? "kamla" : null;

  const input = (id: string, label: string, get: (x: Profile) => string, set: (x: Profile, v: string) => void, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} id={id}>
      <input id={id} className="field-input" value={get(d)} onChange={(e) => up((x) => set(x, e.target.value))} {...extra} />
    </Field>
  );

  const next = () => {
    if (step === 0) {
      if (!d.name.trim()) return setErr('Please enter a name, or tap "Fill sample".');
      setErr("");
      up((x) => { if (!x.first) x.first = x.name.trim().split(" ")[0]; if (!x.rel) x.rel = x.first; if (!x.cg.name) x.cg.name = "Family"; if (!x.sos?.some((c) => c.phone.trim()) && x.cg.phone.trim()) x.sos = [{ ...x.cg }]; });
    }
    if (step < 4) { setStep(step + 1); body.current?.scrollTo({ top: 0 }); return; }
    const clean = structuredClone(d);
    clean.meds = clean.meds.filter((m) => m.name.trim());
    clean.doctors = clean.doctors.filter((x) => x.name.trim());
    clean.sos = (clean.sos ?? []).filter((c) => c.phone.trim());
    if (obEdit === null) addPerson(clean);
    else { saveProfile(obEdit, clean); showToast("Profile saved. Care plan updated."); }
  };

  const scan = () => {
    const src = sampleProfile(d.first === "Kamla" || d.name.includes("Kamla") ? "kamla" : "ramesh", baseDate);
    up((x) => {
      src.doctors.forEach((dc) => { if (!x.doctors.some((y) => y.name === dc.name)) { const e = x.doctors.findIndex((y) => !y.name); if (e >= 0) x.doctors[e] = dc; else x.doctors.push(dc); } });
      src.meds.forEach((m) => { if (!x.meds.some((y) => y.name === m.name)) x.meds.push(m); });
    });
    showToast("Prescription read: doctors and medicines added.");
  };

  const plan = buildPlan(d);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-surface">
      <div className="border-b border-line px-[18px] pb-2.5 pt-4">
        <div className="mb-3 grid grid-cols-5 gap-1.5">{STEPS.map((_, i) => <i key={i} className={`h-[5px] rounded ${i <= step ? "bg-accent" : "bg-line"}`} />)}</div>
        <h2 className="font-display text-[23px] font-semibold leading-tight">{STEPS[step][0]}</h2>
        <p className="mt-1 text-[15px] text-muted">{STEPS[step][1]}</p>
      </div>

      <div ref={body} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4">
        {step === 0 && (
          <>
            {obEdit === null && sampleKey && (
              <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-warm bg-warm-soft px-3 py-2.5 text-sm">
                <span>For the demo, load a sample person.</span>
                <button type="button" className="flex-none rounded-full bg-warm px-3.5 py-1.5 text-sm font-bold text-surface" onClick={() => { setD(sampleProfile(sampleKey, baseDate)); setErr(""); }}>
                  Fill sample: {sampleKey === "ramesh" ? "Ramesh ji" : "Kamla ji"}
                </button>
              </div>
            )}
            {input("f-name", "Full name", (x) => x.name, (x, v) => (x.name = v), { autoComplete: "off" })}
            <div className="grid grid-cols-2 gap-2.5">
              {input("f-first", "Nia calls them", (x) => x.first, (x, v) => (x.first = v), { placeholder: "e.g. Ramesh" })}
              {input("f-rel", "Shown in the app as", (x) => x.rel, (x, v) => (x.rel = v), { placeholder: "e.g. Papa" })}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {input("f-age", "Age", (x) => x.age, (x, v) => (x.age = v), { inputMode: "numeric" })}
              {input("f-phone", "Phone (for calls)", (x) => x.phone, (x, v) => (x.phone = v), { inputMode: "tel" })}
            </div>
            <Field label="Gender"><Picks options={["Male", "Female", "Other"] as const} value={d.gender as "Male"} onToggle={(v) => up((x) => (x.gender = v))} /></Field>
            <Field label="Language Nia speaks"><Picks options={["Hinglish", "Hindi", "Punjabi", "English"] as const} value={d.lang as "Hinglish"} onToggle={(v) => up((x) => (x.lang = v))} /></Field>
            <p className="cap">Family contact</p>
            <div className="grid grid-cols-2 gap-2.5">
              {input("f-cg-name", "Name", (x) => x.cg.name, (x, v) => (x.cg.name = v))}
              {input("f-cg-rel", "Relation", (x) => x.cg.rel, (x, v) => (x.cg.rel = v))}
            </div>
            {input("f-cg-phone", "Phone", (x) => x.cg.phone, (x, v) => (x.cg.phone = v), { inputMode: "tel" })}
            <p className="cap">Emergency contacts (SOS button)</p>
            <p className="-mt-1.5 text-sm text-muted">When the SOS button is pressed, Nia calls and WhatsApps these people. If you leave this empty, the family contact is used.</p>
            <ContactsEditor idPrefix="f-sos" value={d.sos ?? []} onChange={(v) => up((x) => (x.sos = v))} />
            {err && <p className="text-sm text-bad">{err}</p>}
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Conditions (tap all that apply)"><Picks options={CONDITIONS} value={d.conditions} onToggle={(v) => up((x) => (x.conditions = toggle(x.conditions, v)))} /></Field>
            {input("f-allergies", "Allergies", (x) => x.allergies, (x, v) => (x.allergies = v))}
            <Field label="Medical history" id="f-history">
              <textarea id="f-history" className="field-input min-h-[76px]" placeholder="Past surgeries, long-term problems, habits" value={d.history} onChange={(e) => up((x) => (x.history = e.target.value))} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <button type="button" onClick={scan} className="flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-accent bg-accent-soft p-3.5 text-left font-bold text-accent">
              <span className="h-[26px] w-[26px] flex-none">{Icon.camera}</span>
              <span>Scan a prescription<br /><span className="text-sm font-normal">Nia reads the doctor, medicines and timings</span></span>
            </button>
            <p className="cap">Doctors</p>
            {d.doctors.map((_dc, i) => (
              <div key={i} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface2 p-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {input(`f-doc-${i}`, "Doctor", (x) => x.doctors[i].name, (x, v) => (x.doctors[i].name = v))}
                  {input(`f-docsp-${i}`, "For", (x) => x.doctors[i].sp, (x, v) => (x.doctors[i].sp = v))}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {input(`f-docdate-${i}`, "Next check-up", (x) => x.doctors[i].date, (x, v) => (x.doctors[i].date = v), { type: "date" })}
                  {input(`f-doctime-${i}`, "Time", (x) => x.doctors[i].time, (x, v) => (x.doctors[i].time = v), { placeholder: "10:30 am" })}
                </div>
                {input(`f-doctests-${i}`, "Test before visit", (x) => x.doctors[i].tests, (x, v) => (x.doctors[i].tests = v), { placeholder: "e.g. HbA1c" })}
                {d.doctors.length > 1 && <button type="button" className="self-start text-sm font-bold text-bad" onClick={() => up((x) => void x.doctors.splice(i, 1))}>Remove doctor</button>}
              </div>
            ))}
            <button type="button" className="self-start font-bold text-accent" onClick={() => up((x) => void x.doctors.push({ name: "", sp: "", date: "", time: "", tests: "" }))}>+ Add doctor</button>
            <p className="cap">Medicines</p>
            {d.meds.map((m, i) => (
              <div key={i} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface2 p-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {input(`f-med-${i}`, "Medicine", (x) => x.meds[i].name, (x, v) => (x.meds[i].name = v))}
                  {input(`f-dose-${i}`, "Dose", (x) => x.meds[i].dose, (x, v) => (x.meds[i].dose = v))}
                </div>
                <Field label="When"><Picks options={SLOTS} value={m.times} onToggle={(v: Slot) => up((x) => (x.meds[i].times = toggle(x.meds[i].times, v)))} /></Field>
                <Field label="Prescribed by" id={`f-dr-${i}`}>
                  <select id={`f-dr-${i}`} className="field-input" value={m.dr} onChange={(e) => up((x) => (x.meds[i].dr = e.target.value))}>
                    <option value="">—</option>
                    {d.doctors.filter((x) => x.name).map((x) => <option key={x.name}>{x.name}</option>)}
                  </select>
                </Field>
                <button type="button" className="self-start text-sm font-bold text-bad" onClick={() => up((x) => void x.meds.splice(i, 1))}>Remove medicine</button>
              </div>
            ))}
            <button type="button" className="self-start font-bold text-accent" onClick={() => up((x) => void x.meds.push({ name: "", dose: "", times: ["Morning"], note: "", dr: x.doctors[0]?.name || "" }))}>+ Add medicine</button>
          </>
        )}

        {step === 3 && (
          <>
            <div className="panel flex items-start gap-3">
              <Avatar size={38} />
              <p className="font-display text-lg leading-snug">Based on {d.conditions.join(", ") || "general health"}, this is what I'll keep track of. Change how I ask for each one if you like.</p>
            </div>
            {FREQ_ORDER.map((f) => [f, plan.filter((r) => r.freq === f)] as const).filter(([, rs]) => rs.length).map(([f, rs]) => (
              <div key={f} className="panel">
                <p className="cap mb-1">{f}</p>
                {rs.map((r, i) => (
                  <div key={r.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 py-2 ${i ? "border-t border-line" : ""}`}>
                    <strong>{r.name}</strong>
                    {r.ch === "Lab" ? <ChannelBadge ch="Lab" /> : (
                      <select aria-label={`How Nia asks for ${r.name}`} className="rounded-lg border border-line bg-surface px-1.5 py-1 text-[13px]" value={r.ch} onChange={(e) => up((x) => (x.planCh[r.id] = e.target.value as Channel))}>
                        <option>Call</option><option>WhatsApp</option>
                      </select>
                    )}
                    <span className="text-[13px] text-muted">{r.when}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="panel">
              <p className="cap mb-1">Doctor check-ups</p>
              {d.doctors.filter((x) => x.name).map((x, i) => (
                <div key={i} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 py-2 ${i ? "border-t border-line" : ""}`}>
                  <strong>{x.name}</strong><ChannelBadge ch="WhatsApp" />
                  <span className="text-[13px] text-muted">{x.date ? `${visitText(x)}${x.tests ? ` · ${x.tests} 2 days before` : ""} · reminder the day before` : "Nia will ask the family to book"}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <Field label="Daily check-in call" id="f-call">
              <select id="f-call" className="field-input" value={d.checkin.call} onChange={(e) => up((x) => (x.checkin.call = e.target.value))}>
                {["7:30 am", "8:00 am", "8:30 am", "9:00 am", "10:00 am"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Morning medicines: remind by"><Picks options={["Call", "WhatsApp"] as const} value={d.checkin.medMorning} onToggle={(v) => up((x) => (x.checkin.medMorning = v))} /></Field>
            <Field label="Afternoon and night medicines: remind by"><Picks options={["WhatsApp", "Call"] as const} value={d.checkin.medNight} onToggle={(v) => up((x) => (x.checkin.medNight = v))} /></Field>
            <Field label="Weekly health check" id="f-weekly">
              <select id="f-weekly" className="field-input" value={d.checkin.weekly} onChange={(e) => up((x) => (x.checkin.weekly = e.target.value))}>
                {["Sunday 10:00 am", "Sunday 11:00 am", "Saturday 10:00 am"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={`Alert ${d.cg.name || "family"} when`}>
              <div className="flex flex-col gap-2">
                {([["missed", "A medicine is missed twice"], ["range", "A reading is out of safe range"], ["noanswer", "Two calls go unanswered"]] as [AlertKey, string][]).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={d.checkin.alerts.includes(k)} onClick={() => up((x) => (x.checkin.alerts = toggle(x.checkin.alerts, k)))} className={`rounded-xl border-[1.5px] px-3.5 py-2.5 text-left text-[15px] ${d.checkin.alerts.includes(k) ? "border-accent bg-accent-soft font-bold text-accent" : "border-line bg-surface2"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
      </div>

      <div className="flex justify-between gap-2.5 border-t border-line px-4 py-3">
        <button type="button" className="btn-ghost" onClick={() => (step === 0 ? people.length && setOverlay(null) : setStep(step - 1))} disabled={step === 0 && !people.length}>
          {step === 0 ? "Cancel" : "Back"}
        </button>
        <button type="button" className="btn" onClick={next}>{step === 4 ? (obEdit === null ? "Meet Nia" : "Save changes") : "Next"}</button>
      </div>
    </div>
  );
}
