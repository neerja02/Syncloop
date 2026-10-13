import { useEffect, type ReactNode } from "react";
import type { Channel, Tone } from "../../domain/types";
import { useStore } from "../../store/useStore";

export function Badge({ tone = "same", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`badge tone-${tone} ${className}`}>{children}</span>;
}

export function ChannelBadge({ ch }: { ch: Channel }) {
  const cls = ch === "Call" ? "bg-accent-soft text-accent" : ch === "Lab" ? "bg-warm-soft text-warm" : "bg-good-soft text-good";
  return <span className={`inline-flex items-center whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-bold ${cls}`}>{ch}</span>;
}

export function Avatar({ size = 46, online = false }: { size?: number; online?: boolean }) {
  return (
    <div
      aria-hidden
      className="relative grid flex-none place-items-center rounded-full bg-accent-soft font-display font-semibold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.46 }}
    >
      N
      {online && <span className="absolute bottom-0 right-0 h-[11px] w-[11px] rounded-full border-2 border-surface bg-good" />}
    </div>
  );
}

const Check = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export function TickRow({ checked, title, sub, right, onClick }: { checked: boolean; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left">
      <span className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] border-2 ${checked ? "border-good bg-good text-surface" : "border-line bg-surface text-transparent"}`}>
        <Check />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className={checked ? "text-muted" : ""}>{title}</strong>
        {sub && <span className="text-sm text-muted">{sub}</span>}
      </span>
      {right}
    </button>
  );
}

export function Ring({ done, total }: { done: number; total: number }) {
  const C = 2 * Math.PI * 26, off = C * (1 - (total ? done / total : 0));
  return (
    <svg className="h-16 w-16 flex-none" viewBox="0 0 64 64" role="img" aria-label={`${done} of ${total} done`}>
      <circle cx="32" cy="32" r="26" fill="none" strokeWidth="8" style={{ stroke: "rgb(var(--line))" }} />
      <circle cx="32" cy="32" r="26" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 32 32)" style={{ stroke: "rgb(var(--good))", transition: "stroke-dashoffset .4s" }} />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" style={{ fill: "rgb(var(--ink))" }}>{done}/{total}</text>
    </svg>
  );
}

export interface Series { pts: [string, number][]; color: string; area?: boolean }

export function LineChart({ series, min, max, ticks, targets = [], label }: { series: Series[]; min: number; max: number; ticks: number[]; targets?: { v: number; l: string }[]; label: string }) {
  const W = 340, H = 150, L = 34, R = 12, T = 14, B = 24;
  const n = Math.max(...series.map((s) => s.pts.length));
  const x = (i: number) => L + (n < 2 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + ((max - v) / (max - min)) * (H - T - B);
  const text = { fill: "rgb(var(--muted))", fontSize: 12 } as const;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} style={{ stroke: "rgb(var(--line))" }} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" style={text}>{t}</text>
        </g>
      ))}
      {targets.map((t) => (
        <g key={t.l}>
          <line x1={L} x2={W - R} y1={y(t.v)} y2={y(t.v)} strokeDasharray="4 4" style={{ stroke: "rgb(var(--good))" }} />
          <text x={W - R} y={y(t.v) - 5} textAnchor="end" style={{ ...text, fill: "rgb(var(--good))" }}>{t.l}</text>
        </g>
      ))}
      {series.map((s, si) => {
        const d = s.pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[1])}`).join("");
        return (
          <g key={si}>
            {s.area && <path d={`${d}L${x(s.pts.length - 1)},${H - B}L${x(0)},${H - B}Z`} style={{ fill: s.color, opacity: 0.1 }} />}
            <path d={d} fill="none" strokeWidth="2.5" strokeLinejoin="round" style={{ stroke: s.color }} />
            {s.pts.map((p, i) => {
              const last = i === s.pts.length - 1;
              return (
                <g key={i}>
                  <circle cx={x(i)} cy={y(p[1])} r={last ? 5 : 3} strokeWidth="2" style={{ fill: last ? s.color : "rgb(var(--surface))", stroke: s.color }} />
                  {last && <text x={x(i) - 8} y={y(p[1]) - 9} textAnchor="end" style={{ ...text, fill: "rgb(var(--ink))", fontWeight: 700 }}>{p[1]}</text>}
                </g>
              );
            })}
          </g>
        );
      })}
      {series[0].pts.map((p, i) => (n <= 8 || i % 2 === 0 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle" style={text}>{p[0]}</text> : null))}
    </svg>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const hide = useStore((s) => s.hideToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, 5200);
    return () => clearTimeout(t);
  }, [toast, hide]);
  if (!toast) return null;
  return (
    <div role="status" className="absolute inset-x-3 bottom-[84px] z-40 flex items-center justify-between gap-3 rounded-2xl bg-ink px-3.5 py-3 text-[15px] text-surface">
      <span className="rich" dangerouslySetInnerHTML={{ __html: toast.html }} />
      {toast.undo && (
        <button className="flex-none rounded-full border border-current px-3 py-1 text-sm" onClick={() => { toast.undo!(); hide(); }}>
          Undo
        </button>
      )}
    </div>
  );
}

export const Icon = {
  phone: <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-full w-full"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="h-full w-full"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" /><path d="M9 9.5c.3 2.4 2.1 4.6 5 5.5" strokeLinecap="round" /></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4M8.5 15l2 2 4-4" /></svg>,
  doctor: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><path d="M6 3v6a5 5 0 0 0 10 0V3" /><path d="M11 14v2a4 4 0 0 0 8 0v-2" /><circle cx="19" cy="12" r="2" /></svg>,
  alert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.1" /></svg>,
  next: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><path d="M5 5l7 7-7 7M13 5l7 7-7 7" /></svg>,
  reset: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5" /></svg>,
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  clip: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></svg>,
  mic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-full w-full"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  micOff: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-full w-full"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" /></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><path d="M5 12h13M13 6l6 6-6 6" /></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><path d="M15 5l-7 7 7 7" /></svg>,
  talk: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="h-full w-full"><path d="M4 5h16v11H9l-5 4z" /></svg>,
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>,
  health: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full"><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>,
  profile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-full w-full"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>,
  waSend: <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full"><path d="M3 20l18-8L3 4v6l12 2-12 2z" /></svg>,
};
