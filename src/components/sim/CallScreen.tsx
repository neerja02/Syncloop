import { useConversation } from "@elevenlabs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildDynamicVariables, makeCallTools, type CallKind, type ToolEvent } from "../../agent/callTools";
import { esc } from "../../agent/flows";
import { bestVoice, dailyScript, indianVoices, speak, stopSpeaking, usingNiaVoice, weeklyScript, type SimStep } from "../../agent/simCall";
import { judge, READ, readingReply } from "../../domain/catalog";
import { getState, useStore } from "../../store/useStore";
import { Icon } from "../ui/ui";

/** The "Sister Nia – Elderly Care Nurse" ElevenLabs agent (voice: Zara). */
const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || "agent_8401m4vje8w3fdjajg1v11y7z1ef";

type Line = { who: "asha" | "me"; text: string };

function useTimer(running: boolean) {
  const [start] = useState(() => Date.now());
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const s = Math.floor((Date.now() - start) / 1000);
  return { label: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, mins: Math.max(1, Math.round(s / 60)) };
}

function RoundBtn({ kind, label, onClick, size = 68 }: { kind: "ok" | "no" | "neutral"; label: string; onClick: () => void; size?: number }) {
  const bg = kind === "ok" ? "bg-[#2E9B62]" : kind === "no" ? "bg-[#C8432C]" : "bg-white/15";
  return (
    <button aria-label={label} onClick={onClick} className={`grid place-items-center rounded-full text-white ${bg}`} style={{ width: size, height: size, padding: size * 0.27 }}>
      {kind === "ok" ? Icon.phone : Icon.close}
    </button>
  );
}

/** Wraps up any call: chat note, transcript, back to the Nia tab. */
function finishCall(personId: string, kind: CallKind, mins: number, events: ToolEvent[], lines: Line[], live: boolean) {
  const s = getState();
  const label = kind === "weekly" ? "Weekly health check call" : "Check-in call";
  const summary = events.filter((e) => !e.text.startsWith("Weekly check saved")).map((e) => e.text).join(", ");
  s.push({ t: "note", ic: "☎", x: `<b>${label}</b>${live ? " · live" : ""} · ${mins} min${summary ? `<br>${esc(summary)}.` : ""}` }, personId);
  if (lines.length) s.mutate((p) => void p.transcripts.push({ day: s.day, kind: label, lines }), personId);
  s.setOverlay(null);
  s.setTab("talk");
}

export function CallScreen() {
  const p = useStore((s) => s.current())!;
  const kind = useStore((s) => s.callKind);
  const realVoice = useStore((s) => s.realVoice);
  const setRealVoice = useStore((s) => s.setRealVoice);
  const [phase, setPhase] = useState<"ring" | "live" | "sim">("ring");
  const [voices, setVoices] = useState(indianVoices());
  const [voicePick, setVoicePick] = useState<string>();

  useEffect(() => {
    const load = () => setVoices(indianVoices());
    try { window.speechSynthesis?.addEventListener("voiceschanged", load); } catch { /* ignore */ }
    return () => { try { window.speechSynthesis?.removeEventListener("voiceschanged", load); } catch { /* ignore */ } };
  }, []);

  const decline = () => {
    const s = getState();
    s.push({ t: "note", ic: "☎", x: `Missed ${kind === "weekly" ? "weekly check" : "check-in"} call. Nia will try again in 30 minutes, then message ${esc(p.pr.cg.name)} if there's no answer.` });
    s.setOverlay(null);
    s.setTab("talk");
  };

  if (phase === "live") return <LiveCall kind={kind} onFallback={() => setPhase("sim")} />;
  if (phase === "sim") return <SimCall kind={kind} voicePick={voicePick} />;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-call px-5 pb-6 pt-6 text-center text-[#F1F6F4]">
      <p className="text-[15px] opacity-75">Incoming call · {kind === "weekly" ? "Weekly health check" : "Daily check-in"}</p>
      <div className="mx-auto mb-3 mt-6 grid h-24 w-24 animate-ring place-items-center rounded-full bg-[#2A5A50] font-display text-[42px] font-semibold">N</div>
      <h2 className="font-display text-[27px] font-semibold">Sister Nia</h2>
      <p className="mt-1 text-[15px] opacity-75">{kind === "weekly" ? p.pr.checkin.weekly : p.pr.checkin.call} · calling {p.pr.name}</p>

      <div className="mt-auto flex justify-around">
        <div><RoundBtn kind="no" label="Decline" onClick={decline} /><span className="mt-1.5 block text-sm opacity-75">Decline</span></div>
        <div><RoundBtn kind="ok" label="Answer" onClick={() => setPhase(realVoice ? "live" : "sim")} /><span className="mt-1.5 block text-sm opacity-75">Answer</span></div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-2 text-[13px] opacity-90">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={realVoice} onChange={(e) => setRealVoice(e.target.checked)} />
          Live AI voice (ElevenLabs, uses the microphone)
        </label>
        {!realVoice && (
          voices.length ? (
            <select aria-label="Browser voice" className="max-w-full rounded-lg border border-white/25 bg-white/10 px-2 py-1 [&_option]:text-black" value={voicePick || bestVoice()?.name} onChange={(e) => setVoicePick(e.target.value)}>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
          ) : <span>No Indian browser voice found; captions only. Try Chrome or Edge.</span>
        )}
      </div>
    </div>
  );
}

/* ---------------- live ElevenLabs call ---------------- */

function LiveCall({ kind, onFallback }: { kind: CallKind; onFallback: () => void }) {
  const p = useStore((s) => s.current())!;
  const personId = p.id;
  const [error, setError] = useState("");
  const [events, setEvents] = useState<ToolEvent[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const eventsRef = useRef<ToolEvent[]>([]);
  const linesRef = useRef<Line[]>([]);
  const done = useRef(false);
  const started = useRef(false);
  const [muted, setMuted] = useState(false);

  const tools = useMemo(
    () => makeCallTools(personId, kind, (e) => { eventsRef.current = [...eventsRef.current, e]; setEvents(eventsRef.current); }),
    [personId, kind],
  );
  const timer = useTimer(!error);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    finishCall(personId, kind, timer.mins, eventsRef.current, linesRef.current, true);
  };

  const conv = useConversation({
    micMuted: muted,
    clientTools: tools as never,
    onMessage: (m) => {
      const who = (m.role ?? m.source) === "user" ? "me" : "asha";
      if (!m.message?.trim()) return;
      linesRef.current = [...linesRef.current, { who, text: m.message }];
      setLines(linesRef.current);
    },
    onError: (e: unknown) => setError(typeof e === "string" ? e : (e as Error)?.message || "Connection problem"),
    onDisconnect: () => { if (started.current && !error) finish(); },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError("Nia's live voice needs the microphone. Allow it in the browser (in the preview link it isn't available, so run the app on your computer), or use the practice call.");
        return;
      }
      const dynamicVariables = buildDynamicVariables(getState().people.find((x) => x.id === personId)!, kind);
      let signedUrl = "";
      try {
        const r = await fetch("/api/asha/signed-url");
        const body = await r.json().catch(() => ({}));
        if (r.ok && body.signedUrl) signedUrl = body.signedUrl;
      } catch { /* no server: connect to the public agent directly */ }
      try {
        // With the server, the API key stays private (signed URL). Without it, the agent is public, so connect by ID.
        if (signedUrl) await conv.startSession({ signedUrl, dynamicVariables });
        else await conv.startSession({ agentId: AGENT_ID, connectionType: "websocket", dynamicVariables });
      } catch (e) {
        setError((e as Error).message || "Could not connect to Nia's voice.");
      }
    })();
    return () => { try { conv.endSession(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hangUp = () => {
    try { conv.endSession(); } catch { /* ignore */ }
    finish();
  };

  const lastNia = [...lines].reverse().find((l) => l.who === "asha");
  const lastMe = [...lines].reverse().find((l) => l.who === "me");
  const connecting = conv.status !== "connected" && !error;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-call px-5 pb-6 pt-5 text-center text-[#F1F6F4]">
      <div className="flex items-center justify-between text-[13px]">
        <span className="rounded-full bg-white/10 px-2.5 py-1">Live AI voice · ElevenLabs</span>
        <span className="tabular-nums opacity-80">{connecting ? "Connecting…" : `On call · ${timer.label}`}</span>
      </div>
      <div className={`mx-auto mb-2 mt-5 grid h-20 w-20 place-items-center rounded-full bg-[#2A5A50] font-display text-[34px] font-semibold ${conv.isSpeaking ? "animate-ring" : ""}`}>N</div>
      <h2 className="font-display text-[26px] font-semibold">Sister Nia</h2>
      <p className="text-[13px] opacity-70">{error ? "Call could not continue" : connecting ? "Connecting the call…" : conv.isSpeaking ? "Nia is speaking" : "Listening…"}</p>

      {error ? (
        <div className="mt-6 rounded-2xl bg-white/10 p-4 text-left text-[15px]">
          <p className="mb-3">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full bg-white px-4 py-2 font-bold text-[#10201C]" onClick={onFallback}>Use offline call</button>
            <button className="rounded-full border border-white/40 px-4 py-2" onClick={() => getState().setOverlay(null)}>Close</button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-5 min-h-[96px] font-display text-[20px] leading-snug" aria-live="polite">{lastNia ? `“${lastNia.text}”` : ""}</p>
          {lastMe && <p className="mt-2 text-[15px] opacity-75">{p.pr.first} ji: “{lastMe.text}”</p>}
          {events.length > 0 && (
            <div className="mt-4 rounded-2xl bg-white/10 p-3 text-left text-sm">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider opacity-70">What Nia updated</p>
              {events.map((e, i) => <p key={i} className={e.tone === "bad" ? "text-[#FFB4A3]" : ""}>{e.tone === "bad" ? "⚠" : "✓"} {e.text}</p>)}
            </div>
          )}
          <div className="mt-auto flex items-center justify-center gap-8 pt-4">
            <button aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)} className={`grid h-14 w-14 place-items-center rounded-full p-4 ${muted ? "bg-white text-[#10201C]" : "bg-white/15"}`}>{muted ? Icon.micOff : Icon.mic}</button>
            <RoundBtn kind="no" label="End call" onClick={hangUp} size={64} />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- offline scripted call ---------------- */

function SimCall({ kind, voicePick }: { kind: CallKind; voicePick?: string }) {
  const p = useStore((s) => s.current())!;
  const personId = p.id;
  const eventsRef = useRef<ToolEvent[]>([]);
  const linesRef = useRef<Line[]>([]);
  const tools = useMemo(() => makeCallTools(personId, kind, (e) => void (eventsRef.current = [...eventsRef.current, e])), [personId, kind]);
  const [steps, setSteps] = useState<SimStep[]>(() => (kind === "weekly" ? weeklyScript(p, tools) : dailyScript(p, tools)));
  const [i, setI] = useState(0);
  const [val, setVal] = useState("");
  const timer = useTimer(true);
  const st = steps[i];

  useEffect(() => {
    if (!st) return;
    linesRef.current = [...linesRef.current, { who: "asha", text: st.show }];
    void speak(st.say, st.show, voicePick);
    if (st.input) setVal(READ[st.input].def);
  }, [i, st, voicePick]);

  useEffect(() => () => stopSpeaking(), []);

  const end = () => {
    stopSpeaking();
    finishCall(personId, kind, timer.mins, eventsRef.current, linesRef.current, false);
  };

  const choose = (label: string, fn: () => void) => {
    linesRef.current = [...linesRef.current, { who: "me", text: label }];
    fn();
    if (st.end) return end();
    setI(i + 1);
  };

  const submitInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!st.input) return;
    const res = judge(st.input, val);
    if (!res) return;
    linesRef.current = [...linesRef.current, { who: "me", text: val }];
    tools.log_reading({ reading_type: st.input === "pain" ? "pain_score" : st.input, value: val });
    const rep = readingReply(getState().people.find((x) => x.id === personId)!, st.input, res);
    const next = [...steps];
    next.splice(i + 1, 0, { show: rep.show, say: rep.say, opts: [["Theek hai", () => {}]] });
    setSteps(next);
    setI(i + 1);
  };

  if (!st) return null;
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-call px-5 pb-6 pt-5 text-center text-[#F1F6F4]">
      <div className="flex items-center justify-between text-[13px]">
        <span className="rounded-full bg-white/10 px-2.5 py-1">{usingNiaVoice() ? "Offline call · Nia's voice" : "Practice call · computer voice, not Nia's"}</span>
        <span className="tabular-nums opacity-80">On call · {timer.label}</span>
      </div>
      <div className="mx-auto mb-2 mt-4 grid h-20 w-20 place-items-center rounded-full bg-[#2A5A50] font-display text-[34px] font-semibold">N</div>
      <h2 className="font-display text-[26px] font-semibold">Sister Nia</h2>
      <p className="mt-4 min-h-[110px] font-display text-[20px] leading-snug" aria-live="polite">“{st.show}”</p>
      <div className="mt-auto flex flex-col gap-2.5">
        {st.input ? (
          <>
            <form className="flex items-center gap-2" onSubmit={submitInput}>
              <input id="sim-reading" inputMode="decimal" aria-label={READ[st.input].name} value={val} onChange={(e) => setVal(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-xl tabular-nums text-white" />
              <span className="text-sm opacity-70">{READ[st.input].unit}</span>
              <button className="rounded-full bg-white px-4 py-2.5 font-bold text-[#10201C]" type="submit">Bata diya</button>
            </form>
            <p className="text-[13px] opacity-70">{p.pr.first} ji speaks the number; Nia writes it down</p>
          </>
        ) : (
          st.opts?.map(([label, fn]) => (
            <button key={label} onClick={() => choose(label, fn)} className="rounded-2xl border border-white/25 bg-white/10 px-3 py-3 text-[17px]">
              <small className="block text-[11px] uppercase tracking-wider opacity-65">{p.pr.first} ji says</small>{label}
            </button>
          ))
        )}
        <div className="mt-2 flex justify-center"><RoundBtn kind="no" label="End call" onClick={end} size={56} /></div>
      </div>
    </div>
  );
}
