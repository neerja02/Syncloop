import { useEffect, useRef, useState } from "react";
import { isBusy, runChip, sendText, shareFile, submitReading, toggleDose, VOICE_SAMPLES } from "../../agent/flows";
import type { ChatItem, Dose, Person } from "../../domain/types";
import { useStore } from "../../store/useStore";
import { Badge, ChannelBadge, Icon, TickRow } from "../ui/ui";

export function DoseRow({ d, onClick }: { d: Dose; onClick: () => void }) {
  return (
    <TickRow
      checked={!!d.taken}
      title={d.name}
      sub={d.taken ? `${d.dose} · taken ${d.taken}` : `${d.dose} · ${d.note}`}
      right={<ChannelBadge ch={d.ch} />}
      onClick={onClick}
    />
  );
}

const Rich = ({ html, className = "" }: { html: string; className?: string }) => <div className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;

function ReadingCard({ item, index }: { item: Extract<ChatItem, { kind: "reading" }>; index: number }) {
  const [v, setV] = useState(item.def);
  const name = item.rid === "bp" ? "Blood pressure" : item.rid === "fbs" ? "Fasting sugar" : item.rid;
  const unit = item.rid === "bp" ? "mmHg" : item.rid === "fbs" || item.rid === "ppbs" ? "mg/dL" : "";
  if (item.done)
    return (
      <Card title={`${name} · logged`}>
        <div className="flex items-center justify-between gap-3 text-[15px]">
          <span>{item.done} {unit}</span>
          <Badge tone={item.judge}>{item.judge === "good" ? "Normal" : item.judge === "bad" ? "Out of range" : "A bit high"}</Badge>
        </div>
      </Card>
    );
  return (
    <Card title={name}>
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); submitReading(index, v); }}>
        <input id={`reading-${index}`} aria-label={name} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} className="field-input flex-1 text-xl tabular-nums" />
        <span className="text-sm text-muted">{unit}</span>
        <button className="btn" type="submit">Save</button>
      </form>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex w-[90%] flex-col gap-2 self-start rounded-2xl border border-line bg-surface px-3.5 py-3 animate-rise">
      <h3 className="cap">{title}</h3>
      {children}
    </div>
  );
}

function Rows({ rows }: { rows: [string, string, string, string?][] }) {
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 py-1.5 text-[15px] ${i ? "border-t border-line" : ""}`}>
          <span>{r[0]}</span>
          <span className="whitespace-nowrap text-sm tabular-nums text-muted" dangerouslySetInnerHTML={{ __html: r[1] }} />
          {r[3] ? <Badge tone={r[2] as never}>{r[3]}</Badge> : <span />}
        </div>
      ))}
    </div>
  );
}

function Item({ item, index, p }: { item: ChatItem; index: number; p: Person }) {
  const mutate = useStore((s) => s.mutate);
  switch (item.t) {
    case "day":
      return <div className="self-center rounded-full border border-line bg-surface px-3 py-0.5 text-[13px] text-muted">{item.x}</div>;
    case "nurse":
      return <Rich html={item.x} className="max-w-[86%] self-start rounded-[18px] rounded-bl-md border border-line bg-surface px-3.5 py-2.5 animate-rise" />;
    case "me":
      return <div className="max-w-[86%] self-end rounded-[18px] rounded-br-md bg-me px-3.5 py-2.5 animate-rise">{item.x}</div>;
    case "note":
      return (
        <div className="flex items-start gap-2.5 self-stretch rounded-2xl border border-dashed border-line bg-surface px-3 py-2 text-sm text-muted">
          <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{item.ic || "i"}</span>
          <Rich html={item.x} />
        </div>
      );
    case "alert":
      return <Rich html={item.x} className="self-stretch rounded-2xl border border-bad bg-bad-soft px-3.5 py-3 [&_strong]:mb-1 [&_strong]:block [&_strong]:text-lg [&_strong]:text-bad" />;
    case "card":
      if (item.kind === "meds")
        return (
          <Card title={item.title}>
            {p.doses.filter((d) => item.slots.includes(d.slot)).map((d) => <DoseRow key={d.id} d={d} onClick={() => toggleDose(d.id, true)} />)}
          </Card>
        );
      if (item.kind === "tips")
        return (
          <Card title={item.title}>
            {item.items.map((it, k) => (
              <TickRow key={k} checked={!!it.done} title={it.text} sub={it.sub} onClick={() => mutate((x) => { const c = x.log[index]; if (c.t === "card" && c.kind === "tips") c.items[k].done = !c.items[k].done; })} />
            ))}
          </Card>
        );
      if (item.kind === "reading") return <ReadingCard item={item} index={index} />;
      if (item.kind === "report") {
        const r = p.reports[item.ri];
        return r ? <Card title={`${r.name} · ${r.date}`}><Rows rows={r.rows.map((x) => [x[0], `${x[1]} → <b>${x[2]}</b>`, x[3], x[4]])} /></Card> : null;
      }
      if (item.kind === "weekly")
        return (
          <Card title={`Weekly health check · ${item.w.date}`}>
            <Rows rows={item.w.rows.map((r) => [r[0], r[1], r[2], r[3]])} />
            <p className="text-sm text-muted"><b className="text-ink">{item.w.verdict}</b> · sent to {p.pr.cg.name || "family"}</p>
          </Card>
        );
      if (item.kind === "rx") return <Card title={`Read from photo · ${item.dr}`}><Rows rows={item.lines} /></Card>;
      return null;
  }
}

export function TalkTab() {
  const p = useStore((s) => s.current());
  const typing = useStore((s) => s.typing);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const vi = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [p?.log.length, typing, p?.chips.length]);

  if (!p) return null;

  const onFile = (via: "camera" | "upload") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) shareFile(f.name, via);
  };

  const mic = async () => {
    if (isBusy()) return;
    setListening(true);
    await new Promise((r) => setTimeout(r, 1500));
    setListening(false);
    sendText(VOICE_SAMPLES[vi.current++ % VOICE_SAMPLES.length]);
  };

  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-2.5">
          {p.log.map((it, i) => <Item key={i} item={it} index={i} p={p} />)}
          {typing && (
            <div className="flex gap-1.5 self-start rounded-[18px] border border-line bg-surface px-4 py-3" aria-label="Nia is typing">
              {[0, 1, 2].map((i) => <i key={i} className="h-[7px] w-[7px] animate-dot rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          )}
        </div>
      </div>
      {p.chips.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2 px-4 pb-2.5">
          {p.chips.map((c, i) => <button key={i} className="chip" onClick={() => runChip(i)}>{c.label}</button>)}
        </div>
      )}
      <form
        className="flex items-center gap-1.5 border-t border-line bg-surface px-3 py-2.5"
        onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; sendText(text.trim()); setText(""); }}
      >
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile("camera")} />
        <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={onFile("upload")} />
        <button type="button" aria-label="Take a photo of a prescription or report" title="Camera" onClick={() => cameraInput.current?.click()} className="grid h-[44px] w-[44px] flex-none place-items-center rounded-full border border-line bg-surface2 p-[11px]">{Icon.camera}</button>
        <button type="button" aria-label="Upload a prescription or report (photo or PDF)" title="Upload" onClick={() => fileInput.current?.click()} className="grid h-[44px] w-[44px] flex-none place-items-center rounded-full border border-line bg-surface2 p-[11px]">{Icon.clip}</button>
        <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Sun rahi hoon…" : "Nia se baat kijiye…"} aria-label="Message to Nia" className="min-w-0 flex-1 rounded-full border border-line bg-surface2 px-4 py-3" />
        <button type="button" aria-label="Speak to Nia" onClick={mic} className={`grid h-[46px] w-[46px] flex-none place-items-center rounded-full border p-3 ${listening ? "animate-pulse border-bad bg-bad text-white" : "border-line bg-surface2"}`}>{Icon.mic}</button>
        <button type="submit" aria-label="Send" className="grid h-[46px] w-[46px] flex-none place-items-center rounded-full bg-accent p-3 text-accent-ink">{Icon.send}</button>
      </form>
    </>
  );
}
