import { askReading, toggleDose } from "../../agent/flows";
import { READ, SLOTS } from "../../domain/catalog";
import { dayLabel } from "../../domain/dates";
import { dueToday, loggedToday } from "../../domain/health";
import { useStore } from "../../store/useStore";
import { Badge, ChannelBadge, Ring } from "../ui/ui";
import { DoseRow } from "./TalkTab";

export function TodayTab() {
  const p = useStore((s) => s.current());
  const { baseDate, day, setTab, push } = useStore();
  if (!p) return null;
  const due = dueToday(p, baseDate, day).filter((r) => READ[r.id]);
  const rDone = due.filter((r) => loggedToday(p, r.id, day)).length;
  const done = p.doses.filter((d) => d.taken).length + rDone;
  const total = p.doses.length + due.length;
  const slots = SLOTS.filter((s) => p.doses.some((d) => d.slot === s));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <section className="mb-6 flex flex-col gap-3">
        <h2 className="sec-title">{p.pr.first} ji ka din</h2>
        <p className="-mt-2 text-sm text-muted">{dayLabel(baseDate, day)}</p>
        <div className="panel flex items-center gap-3.5">
          <Ring done={done} total={total} />
          <div>
            <strong>{done === total ? "Aaj ka sab ho gaya ✓" : `${total - done} cheezein baaki hain`}</strong>
            <p className="text-sm text-muted">Medicines and readings for today</p>
          </div>
        </div>
      </section>

      <section className="mb-6 flex flex-col gap-3">
        <h2 className="sec-title">Medicines</h2>
        <div className="panel">
          {slots.length ? slots.map((s) => (
            <div key={s}>
              <p className="cap mb-0.5 mt-2.5 first:mt-0">{s}</p>
              {p.doses.filter((d) => d.slot === s).map((d) => <DoseRow key={d.id} d={d} onClick={() => toggleDose(d.id, false)} />)}
            </div>
          )) : <p className="text-sm text-muted">No medicines added yet.</p>}
        </div>
      </section>

      <section className="mb-6 flex flex-col gap-3">
        <h2 className="sec-title">Readings due today</h2>
        <div className="panel">
          {due.length ? due.map((r, i) => {
            const got = loggedToday(p, r.id, day);
            return (
              <div key={r.id} className={`flex items-start justify-between gap-3 py-2.5 ${i ? "border-t border-line" : ""}`}>
                <div className="min-w-0"><strong className="block">{r.name}</strong><span className="text-sm text-muted">{r.when}</span></div>
                <div className="flex flex-none flex-col items-end gap-1">
                  {got ? <Badge tone="good">{r.id === "bp" ? `${got[1]}/${got[2]}` : got[1]} {r.unit}</Badge> : (
                    <button className="font-bold text-accent" onClick={() => { setTab("talk"); push({ t: "nurse", x: `${READ[r.id].name} bata dijiye:` }); askReading(r.id); }}>Enter reading</button>
                  )}
                  <ChannelBadge ch={r.ch} />
                </div>
              </div>
            );
          }) : <p className="text-sm text-muted">No readings due today.</p>}
        </div>
      </section>
    </div>
  );
}
