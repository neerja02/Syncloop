import type { Contact } from "../../domain/types";

/** Editable list of emergency contacts (name, relation, phone). */
export function ContactsEditor({ value, onChange, idPrefix }: { value: Contact[]; onChange: (v: Contact[]) => void; idPrefix: string }) {
  const set = (i: number, k: keyof Contact, v: string) => onChange(value.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  return (
    <div className="flex flex-col gap-2.5">
      {value.map((c, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-3xl bg-surface shadow-card p-3">
          <div className="flex items-center justify-between">
            <span className="cap">Contact {i + 1}{i === 0 ? " · called first" : ""}</span>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-sm font-bold text-bad">Remove</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input id={`${idPrefix}-name-${i}`} aria-label={`Contact ${i + 1} name`} placeholder="Name" className="field-input" value={c.name} onChange={(e) => set(i, "name", e.target.value)} />
            <input aria-label={`Contact ${i + 1} relation`} placeholder="Relation" className="field-input" value={c.rel} onChange={(e) => set(i, "rel", e.target.value)} />
          </div>
          <input aria-label={`Contact ${i + 1} phone (calls and WhatsApp)`} placeholder="Phone (calls and WhatsApp)" inputMode="tel" className="field-input" value={c.phone} onChange={(e) => set(i, "phone", e.target.value)} />
        </div>
      ))}
      {value.length < 3 && (
        <button type="button" className="btn-ghost self-start" onClick={() => onChange([...value, { name: "", rel: "", phone: "" }])}>+ Add emergency contact</button>
      )}
    </div>
  );
}
