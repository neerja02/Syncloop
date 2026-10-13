import { shortDate } from "../../domain/dates";
import { healthStatus, healthSummary, visitText } from "../../domain/health";
import { useStore } from "../../store/useStore";
import { Avatar, Badge, LineChart } from "../ui/ui";

const Sec = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <section className="mb-6 flex flex-col gap-3">
    <h2 className="sec-title">{title}</h2>
    {sub && <p className="-mt-1.5 text-sm text-muted">{sub}</p>}
    {children}
  </section>
);

export function HealthTab() {
  const p = useStore((s) => s.current());
  const baseDate = useStore((s) => s.baseDate);
  if (!p) return null;
  const st = healthStatus(p);
  const bp = (p.readings.bp || []).slice(-8);
  const fbs = (p.readings.fbs || []).slice(-8);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <Sec title={`How ${p.pr.first} ji is doing`}>
        <div className="panel flex items-start gap-3">
          <Avatar size={38} />
          <p className="font-display text-lg leading-snug">{healthSummary(p, st)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {st.map((s) => (
            <div key={s.k} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-3 py-2.5">
              <span className="font-bold">{s.k}</span>
              <span><Badge tone={s.s}>{s.t}</Badge></span>
              <span className="text-[13px] text-muted">{s.d}</span>
            </div>
          ))}
        </div>
      </Sec>

      {p.weekly.length > 0 && (
        <Sec title="Weekly health checks">
          {[...p.weekly].reverse().map((w, i) => (
            <details key={i} open={i === 0} className="rounded-2xl border border-line bg-surface px-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 py-3">
                <span><strong className="block">{w.date}</strong><span className="text-sm text-muted">{w.verdict}</span></span>
                <Badge tone={w.verdict.startsWith("Better") ? "good" : w.verdict.startsWith("Needs") ? "warn" : "same"}>{w.verdict.split(" ")[0]}</Badge>
              </summary>
              <div className="pb-3">
                {w.rows.map((r, k) => (
                  <div key={k} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 py-1.5 text-[15px] ${k ? "border-t border-line" : ""}`}>
                    <span>{r[0]}</span><span className="text-sm text-muted">{r[1]}</span><Badge tone={r[2]}>{r[3]}</Badge>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </Sec>
      )}

      {bp.length > 1 && (
        <Sec title={`Blood pressure, last ${bp.length} days`}>
          <div className="panel">
            <LineChart
              label="Blood pressure trend"
              series={[
                { pts: bp.map((x) => [shortDate(baseDate, x[0]), x[1]]), color: "rgb(var(--accent))" },
                { pts: bp.map((x) => [shortDate(baseDate, x[0]), x[2] ?? 0]), color: "rgb(var(--warm))" },
              ]}
              min={60} max={180} ticks={[60, 100, 140, 180]} targets={[{ v: 140, l: "Upper limit 140" }]}
            />
            <div className="mt-1.5 flex gap-3.5 text-[13px] text-muted">
              <span><i className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-accent align-middle" />Upper (systolic)</span>
              <span><i className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-warm align-middle" />Lower (diastolic)</span>
            </div>
          </div>
        </Sec>
      )}
      {fbs.length > 1 && (
        <Sec title={`Fasting sugar, last ${fbs.length} days`}>
          <div className="panel">
            <LineChart label="Fasting sugar trend" series={[{ pts: fbs.map((x) => [shortDate(baseDate, x[0]), x[1]]), color: "rgb(var(--accent))", area: true }]} min={60} max={200} ticks={[60, 100, 150, 200]} targets={[{ v: 130, l: "Target under 130" }]} />
          </div>
        </Sec>
      )}
      {Object.entries(p.labs).map(([id, l]) => {
        const mn = Math.floor(Math.min(...l.pts.map((x) => x[1]), l.target) - 1);
        const mx = Math.ceil(Math.max(...l.pts.map((x) => x[1])) + 0.5);
        return (
          <Sec key={id} title={`${l.name} over the year`}>
            <div className="panel">
              <LineChart label={l.name} series={[{ pts: l.pts, color: "rgb(var(--accent))", area: true }]} min={mn} max={mx} ticks={[mn, Math.round(((mn + mx) / 2) * 10) / 10, mx]} targets={[{ v: l.target, l: `Target ${l.target}` }]} />
            </div>
          </Sec>
        );
      })}

      <Sec title="Doctor visits" sub="Nia lines up the tests before each visit and reminds the day before.">
        <div className="panel">
          {p.pr.doctors.filter((d) => d.name).map((d, i) => (
            <div key={i} className={`flex items-start justify-between gap-3 py-2.5 ${i ? "border-t border-line" : ""}`}>
              <div className="min-w-0"><strong className="block">{d.name}</strong><span className="text-sm text-muted">{d.sp}{d.tests ? ` · test before: ${d.tests}` : ""}</span></div>
              <Badge tone={d.date ? "acc" : "warn"}>{d.date ? visitText(d) : "Not booked"}</Badge>
            </div>
          ))}
        </div>
      </Sec>

      <Sec title="Prescriptions" sub="Grouped by doctor. Nia reads them; only doctors change them.">
        {[...new Set(p.pr.meds.map((m) => m.dr))].map((dr) => {
          const ms = p.pr.meds.filter((m) => m.dr === dr);
          return (
            <details key={dr} className="rounded-2xl border border-line bg-surface px-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 py-3">
                <span><strong className="block">{dr || "Doctor"}</strong><span className="text-sm text-muted">{p.pr.doctors.find((d) => d.name === dr)?.sp}</span></span>
                <Badge>{ms.length} medicine{ms.length > 1 ? "s" : ""}</Badge>
              </summary>
              <div className="pb-3">
                {ms.map((m, k) => (
                  <div key={k} className={`flex justify-between gap-3 py-1.5 text-[15px] ${k ? "border-t border-line" : ""}`}>
                    <span>{m.name} {m.dose}</span><span className="text-sm text-muted">{m.times.join(", ").toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </Sec>

      {p.reports.length > 0 && (
        <Sec title="Reports">
          {p.reports.map((r, i) => (
            <details key={i} className="rounded-2xl border border-line bg-surface px-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 py-3">
                <span><strong className="block">{r.name}</strong><span className="text-sm text-muted">{r.lab} · {r.date}</span></span>
              </summary>
              <div className="pb-3">
                {r.rows.map((row, k) => (
                  <div key={k} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 py-1.5 text-[15px] ${k ? "border-t border-line" : ""}`}>
                    <span>{row[0]}</span><span className="text-sm text-muted">{row[1]} → <b className="text-ink">{row[2]}</b></span><Badge tone={row[3]}>{row[4]}</Badge>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </Sec>
      )}

      {p.transcripts.length > 0 && (
        <Sec title="Call transcripts" sub="Saved from live calls with Nia.">
          {[...p.transcripts].reverse().slice(0, 5).map((t, i) => (
            <details key={i} className="rounded-2xl border border-line bg-surface px-3.5">
              <summary className="cursor-pointer list-none py-3"><strong>{t.kind}</strong> <span className="text-sm text-muted">· {shortDate(baseDate, t.day)} · {t.lines.length} lines</span></summary>
              <div className="flex flex-col gap-1.5 pb-3 text-[15px]">
                {t.lines.map((l, k) => <p key={k}><b>{l.who === "asha" ? "Nia" : p.pr.first}:</b> {l.text}</p>)}
              </div>
            </details>
          ))}
        </Sec>
      )}
    </div>
  );
}
