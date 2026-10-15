import { useEffect, useRef, useState } from "react";
import { askReading, isBusy, runChip, sendText, shareFile, submitReading, toggleDose, VOICE_SAMPLES } from "../../agent/flows";
import { speak, stopSpeaking } from "../../agent/simCall";
import { READ } from "../../domain/catalog";
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
  const name = READ[item.rid]?.name ?? item.rid;
  const unit = READ[item.rid]?.unit ?? "";
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
    <div className="flex w-[90%] flex-col gap-2 self-start rounded-3xl bg-surface shadow-card px-3.5 py-3 animate-rise">
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

/** Plain words from a chat bubble, for reading aloud. */
const spoken = (html: string) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\p{Extended_Pictographic}|\uFE0F/gu, "").replace(/\s+/g, " ").trim();
};

interface ReadAloud { playing: boolean; toggle: () => void }

function ListenButton({ playing, toggle }: ReadAloud) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Stop reading this message" : "Read this message aloud"}
      aria-pressed={playing}
      title={playing ? "Stop" : "Listen"}
      className={`grid h-8 w-8 place-items-center rounded-full p-[7px] ${playing ? "bg-accent text-accent-ink" : "text-muted hover:bg-accent-soft hover:text-accent"}`}
    >
      {playing ? Icon.stop : Icon.speaker}
    </button>
  );
}

function Item({ item, index, p, aloud }: { item: ChatItem; index: number; p: Person; aloud: ReadAloud }) {
  const mutate = useStore((s) => s.mutate);
  switch (item.t) {
    case "day":
      return <div className="self-center rounded-full bg-surface px-3.5 py-1 text-[13px] text-muted">{item.x}</div>;
    case "nurse":
      return (
        <div className="flex max-w-[86%] flex-col items-start gap-0.5 self-start animate-rise">
          <Rich html={item.x} className="rounded-3xl rounded-bl-lg bg-surface px-4 py-3 shadow-card" />
          <ListenButton {...aloud} />
        </div>
      );
    case "me":
      return <div className="max-w-[86%] self-end rounded-3xl rounded-br-lg bg-me px-4 py-3 animate-rise">{item.x}</div>;
    case "note":
      return (
        <div className="flex items-start gap-2.5 self-stretch rounded-2xl border border-dashed border-line bg-surface px-3 py-2 text-sm text-muted">
          <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{item.ic || "i"}</span>
          <Rich html={item.x} />
        </div>
      );
    case "alert":
      return (
        <div className="flex flex-col items-start gap-0.5 self-stretch">
          <Rich html={item.x} className="self-stretch rounded-2xl border border-bad bg-bad-soft px-3.5 py-3 [&_strong]:mb-1 [&_strong]:block [&_strong]:text-lg [&_strong]:text-bad" />
          <ListenButton {...aloud} />
        </div>
      );
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

const SIZES = [1, 1.15, 1.3, 1.5, 1.75];

/** Compact A− / A+ for the app header, so people with weak eyesight can enlarge the chat. */
export function TextSize() {
  const scale = useStore((s) => s.textScale);
  const set = useStore((s) => s.setTextScale);
  const i = Math.max(0, SIZES.indexOf(scale));
  const btn = "grid h-9 w-9 place-items-center rounded-full font-display font-semibold leading-none hover:bg-surface disabled:opacity-35";
  return (
    <div className="flex flex-none items-center rounded-full bg-surface2 p-0.5" role="group" aria-label={`Text size ${Math.round(SIZES[i] * 100)}%`}>
      <button type="button" className={`${btn} text-[14px]`} onClick={() => set(SIZES[i - 1])} disabled={i === 0} aria-label="Smaller text" title="Smaller text">A−</button>
      <span className="h-5 w-px bg-line" aria-hidden />
      <button type="button" className={`${btn} text-[19px]`} onClick={() => set(SIZES[i + 1])} disabled={i === SIZES.length - 1} aria-label="Bigger text" title="Bigger text">A+</button>
    </div>
  );
}

function AttachMenu({ onPick, onClose }: { onPick: (k: string) => void; onClose: (byKey: boolean) => void }) {
  const p = useStore((s) => s.current());
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close.current(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(true); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, []);

  const readings = [...new Set((p?.plan ?? []).map((r) => r.id))].filter((id) => READ[id]);
  const item = (k: string, icon: JSX.Element, label: string, sub: string) => (
    <button key={k} type="button" role="menuitem" onClick={() => onPick(k)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface2 focus-visible:bg-surface2">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-soft p-2 text-accent">{icon}</span>
      <span className="min-w-0"><strong className="block text-[15px]">{label}</strong><span className="block text-[13px] text-muted">{sub}</span></span>
    </button>
  );
  return (
    <div ref={ref} role="menu" aria-label="Add to message" className="absolute bottom-[calc(100%+8px)] left-0 z-30 max-h-[340px] w-[min(290px,100%)] overflow-y-auto rounded-3xl bg-surface shadow-card p-1.5 shadow-phone">
      {item("camera", Icon.camera, "Take a photo", "Prescription, report or medicine strip")}
      {item("gallery", Icon.image, "Photo from gallery", "A picture already on this phone")}
      {item("file", Icon.file, "Upload a document", "PDF test report or prescription")}
      {readings.length > 0 && (
        <>
          <p className="cap mt-1.5 border-t border-line px-2.5 pb-1 pt-2.5">Add a reading</p>
          {readings.map((id) => item(`reading:${id}`, Icon.health, READ[id].name, READ[id].unit === "/10" ? "Score out of 10" : `In ${READ[id].unit}`))}
        </>
      )}
    </div>
  );
}

export function TalkTab() {
  const p = useStore((s) => s.current());
  const typing = useStore((s) => s.typing);
  const scale = useStore((s) => s.textScale);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [menu, setMenu] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const vi = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const plusBtn = useRef<HTMLButtonElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [p?.log.length, typing, p?.chips.length]);

  // Grow the message box with the text, up to about five lines.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [text, scale]);

  // Stop reading aloud when leaving the chat or switching person.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  useEffect(() => () => { if (playingRef.current !== null) stopSpeaking(); }, [p?.id]);

  if (!p) return null;

  const onFile = (via: "camera" | "upload") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) shareFile(f.name, via);
  };

  const pick = (k: string) => {
    setMenu(false);
    if (k === "camera") cameraInput.current?.click();
    else if (k === "gallery") galleryInput.current?.click();
    else if (k === "file") fileInput.current?.click();
    else if (k.startsWith("reading:")) askReading(k.slice(8));
  };

  const closeMenu = (byKey: boolean) => { setMenu(false); if (byKey) plusBtn.current?.focus(); };

  const mic = async () => {
    if (isBusy()) return;
    setListening(true);
    await new Promise((r) => setTimeout(r, 1500));
    setListening(false);
    sendText(VOICE_SAMPLES[vi.current++ % VOICE_SAMPLES.length]);
  };

  const send = () => {
    if (!text.trim()) return;
    sendText(text.trim());
    setText("");
  };

  const aloud = (i: number, html: string): ReadAloud => ({
    playing: playing === i,
    toggle: () => {
      if (playing === i) { stopSpeaking(); return; }
      const words = spoken(html);
      void speak(words, words, undefined, () => setPlaying((cur) => (cur === i ? null : cur)));
      setPlaying(i);
    },
  });

  const round = "grid h-10 w-10 flex-none place-items-center rounded-full";

  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3" style={{ zoom: scale }}>
          {p.log.map((it, i) => <Item key={i} item={it} index={i} p={p} aloud={aloud(i, "x" in it ? it.x : "")} />)}
          {typing && (
            <div className="flex gap-1.5 self-start rounded-3xl bg-surface shadow-card px-4 py-3" aria-label="Nia is typing">
              {[0, 1, 2].map((i) => <i key={i} className="h-[7px] w-[7px] animate-dot rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          )}
        </div>
      </div>
      {p.chips.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2 px-4 pb-2.5" style={{ zoom: Math.min(scale, 1.3) }}>
          {p.chips.map((c, i) => <button key={i} className="chip" onClick={() => runChip(i)}>{c.label}</button>)}
        </div>
      )}
      <form className="bg-surface px-3 pb-3 pt-2.5" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile("camera")} />
        <input ref={galleryInput} type="file" accept="image/*" hidden onChange={onFile("upload")} />
        <input ref={fileInput} type="file" accept="application/pdf,image/*" hidden onChange={onFile("upload")} />
        <div className="relative flex items-end gap-1 rounded-[28px] border border-transparent bg-surface2 p-1 focus-within:border-accent/50 focus-within:bg-surface">
          {menu && <AttachMenu onPick={pick} onClose={closeMenu} />}
          <button
            ref={plusBtn}
            type="button"
            aria-label="Add a photo, file or reading"
            aria-haspopup="menu"
            aria-expanded={menu}
            onPointerDown={(e) => menu && e.stopPropagation()}
            onClick={() => setMenu((m) => !m)}
            className={`${round} p-2.5 transition-transform ${menu ? "rotate-45 bg-accent-soft text-accent" : "text-ink hover:bg-surface"}`}
          >
            {Icon.plus}
          </button>
          <label htmlFor="chat-input" className="sr-only">Message to Nia</label>
          <textarea
            ref={box}
            id="chat-input"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder={listening ? "Sun rahi hoon…" : "Nia se baat kijiye…"}
            className="block min-h-10 min-w-0 flex-1 resize-none self-center bg-transparent px-1 py-2 leading-6 text-ink outline-none placeholder:text-muted"
            style={{ fontSize: `${17 * Math.min(scale, 1.3)}px` }}
          />
          <button type="button" aria-label={listening ? "Listening" : "Speak to Nia"} onClick={mic} className={`${round} p-2.5 ${listening ? "animate-pulse bg-bad text-white" : "text-muted hover:bg-surface"}`}>{Icon.mic}</button>
          <button type="submit" aria-label="Send" disabled={!text.trim()} className={`${round} bg-accent p-2.5 text-accent-ink disabled:opacity-35`}>{Icon.arrowUp}</button>
        </div>
      </form>
    </>
  );
}
