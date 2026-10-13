import { useEffect, useRef, useState } from "react";
import { esc } from "../../agent/flows";
import { sosContacts, sosMessage, telLink, whatsappLink } from "../../domain/emergency";
import { getState, useStore } from "../../store/useStore";
import { Icon } from "../ui/ui";

type Result = { name: string; call: string; whatsapp: string };
type Phase = "countdown" | "sending" | "done";

const COUNTDOWN = 5;

function getLocation(): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    const t = setTimeout(() => resolve(undefined), 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(t); resolve(`https://maps.google.com/?q=${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`); },
      () => { clearTimeout(t); resolve(undefined); },
      { enableHighAccuracy: true, timeout: 4500, maximumAge: 60_000 },
    );
  });
}

const isPhone = () => {
  try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; }
};

export function SosScreen() {
  const p = useStore((s) => s.current())!;
  const setOverlay = useStore((s) => s.setOverlay);
  const setTab = useStore((s) => s.setTab);
  const contacts = sosContacts(p.pr);
  const [phase, setPhase] = useState<Phase>("countdown");
  const [left, setLeft] = useState(COUNTDOWN);
  const [results, setResults] = useState<Result[] | null>(null);
  const [message, setMessage] = useState(() => sosMessage(p.pr));
  const started = useRef(false);

  useEffect(() => {
    if (phase !== "countdown" || !contacts.length) return;
    if (left <= 0) { void send(); return; }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, left]);

  async function send() {
    if (started.current) return;
    started.current = true;
    setPhase("sending");
    const maps = await getLocation();
    const msg = sosMessage(p.pr, maps);
    setMessage(msg);

    let res: Result[] | null = null;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient: p.pr.name || p.pr.first, patientPhone: p.pr.phone, message: msg, contacts }),
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (r.ok) res = ((await r.json()) as { results: Result[] }).results;
    } catch { /* server not running: fall back to dialer and WhatsApp links */ }
    setResults(res);

    const s = getState();
    const names = contacts.map((c) => c.name || c.phone).join(", ");
    s.push({ t: "alert", x: `<strong>SOS pressed</strong>Nia is contacting ${esc(names)} by call and WhatsApp.${maps ? ` Location shared.` : ""} If it's serious, call <b>112</b> now.` }, p.id);
    const placed = res?.some((x) => x.call === "placed");
    if (!placed && contacts[0] && isPhone()) window.location.href = telLink(contacts[0].phone);
    setPhase("done");
  }

  const close = () => { setOverlay(null); setTab("talk"); };

  const status = (r?: Result) => {
    if (!r) return "Tap the buttons below to call and WhatsApp";
    const call = r.call === "placed" ? "Calling now ✓" : r.call.startsWith("failed") ? "Call failed" : "Call: tap below";
    const wa = r.whatsapp === "sent" ? "WhatsApp sent ✓" : r.whatsapp.startsWith("failed") ? "WhatsApp failed" : "WhatsApp: tap below";
    return `${call} · ${wa}`;
  };

  return (
    <div role="alertdialog" aria-labelledby="sos-h" className="absolute inset-0 z-40 flex flex-col overflow-y-auto bg-[#7A1F12] px-5 pb-6 pt-6 text-center text-white">
      {!contacts.length ? (
        <>
          <h2 id="sos-h" className="font-display text-[28px] font-semibold">No emergency contact saved</h2>
          <p className="mt-2 text-[17px] opacity-90">Add a family member's phone number in Profile → Emergency contacts.</p>
          <a href="tel:112" className="mt-8 rounded-full bg-white py-4 text-xl font-bold text-[#7A1F12]">Call 112 (Emergency)</a>
          <button className="mt-3 rounded-full border-2 border-white/70 py-3.5 text-lg font-bold" onClick={() => { setOverlay(null); setTab("profile"); }}>Add emergency contact</button>
          <button className="mt-auto pt-6 text-[15px] underline opacity-85" onClick={close}>Close</button>
        </>
      ) : phase === "countdown" ? (
        <>
          <p className="text-[15px] font-bold uppercase tracking-[0.1em] opacity-80">Emergency</p>
          <h2 id="sos-h" className="mt-2 font-display text-[28px] font-semibold leading-tight">Calling {contacts[0].name || contacts[0].phone} in</h2>
          <div className="mx-auto my-6 grid h-36 w-36 animate-ring place-items-center rounded-full bg-[#C8432C] font-display text-[64px] font-semibold tabular-nums" aria-live="assertive">{left}</div>
          <p className="text-[17px] opacity-90">Nia will call and WhatsApp {contacts.map((c) => c.name || c.phone).join(", ")} with your location.</p>
          <button className="mt-6 rounded-full bg-white py-4 text-xl font-bold text-[#7A1F12]" onClick={() => void send()}>Send help now</button>
          <button className="mt-3 rounded-full border-2 border-white/70 py-4 text-xl font-bold" onClick={close}>Cancel, I'm OK</button>
        </>
      ) : phase === "sending" ? (
        <>
          <h2 id="sos-h" className="mt-16 font-display text-[28px] font-semibold">Getting help…</h2>
          <p className="mt-2 text-[17px] opacity-90">Finding your location and contacting your family.</p>
        </>
      ) : (
        <>
          <h2 id="sos-h" className="font-display text-[28px] font-semibold">Help is on the way</h2>
          <p className="mt-1 text-[16px] opacity-90">Stay where you are. Sit down if you can.</p>
          <div className="mt-5 flex flex-col gap-3 text-left">
            {contacts.map((c, i) => (
              <div key={i} className="rounded-2xl bg-white/10 p-3">
                <p className="text-lg font-bold">{c.name || c.phone}{c.rel ? <span className="font-normal opacity-80"> · {c.rel}</span> : null}</p>
                <p className="text-sm opacity-85">{status(results?.[i])}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <a href={telLink(c.phone)} className="flex items-center justify-center gap-2 rounded-full bg-white py-3 font-bold text-[#7A1F12]"><span className="h-5 w-5">{Icon.phone}</span>Call</a>
                  <a href={whatsappLink(c.phone, message)} target="_blank" rel="noreferrer" className="flex items-center justify-center rounded-full bg-[#25D366] py-3 font-bold text-[#0B3B1F]">WhatsApp</a>
                </div>
              </div>
            ))}
          </div>
          <a href="tel:112" className="mt-4 rounded-full border-2 border-white py-3.5 text-lg font-bold">Call 112 (Ambulance / Police)</a>
          <button className="mt-auto pt-6 text-[15px] underline opacity-85" onClick={close}>Close</button>
        </>
      )}
    </div>
  );
}
