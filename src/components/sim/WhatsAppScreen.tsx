import { useEffect, useRef, useState } from "react";
import { esc, familyNote, logReading } from "../../agent/flows";
import { judge, READ, readingReply } from "../../domain/catalog";
import { dateOf, dayLabel } from "../../domain/dates";
import { has, hon, nextVisit, visitText } from "../../domain/health";
import type { Person, WaItem } from "../../domain/types";
import { getState, useStore } from "../../store/useStore";
import { Avatar, Icon } from "../ui/ui";

const uid = () => Math.random().toString(36).slice(2, 9);
const add = (items: Omit<WaItem, "id">[]) => getState().mutate((p) => void p.wa.push(...items.map((x) => ({ ...x, id: uid() }))));

/** Rail button "WhatsApp": today's sugar request and medicine reminders (once per day). */
export function waDaily() {
  const s = getState(), p = s.current();
  if (!p) return;
  if (p.waDay !== s.day) {
    const items: Omit<WaItem, "id">[] = [{ day: dayLabel(s.baseDate, s.day) }];
    let expect: string | null = null;
    if (has(p, "fbs") && !(p.readings.fbs || []).some((x) => x[0] === s.day)) {
      items.push({ from: "asha", html: `Good morning ${esc(hon(p))} ☀️ Fasting sugar check karke number bhej dijiye. Chai se pehle 🙏`, time: "7:30 am" });
      expect = "fbs";
    }
    if (has(p, "ppbs") && dateOf(s.baseDate, s.day).getDay() === 6) items.push({ from: "asha", html: "Aaj Saturday hai, lunch ke 2 ghante baad sugar check karke bhejiyega.", time: "1:15 pm" });
    const aft = p.doses.filter((d) => d.slot === "Afternoon" && d.ch === "WhatsApp");
    if (aft.length) items.push({ from: "asha", html: `🍽 Lunch ho gaya? <b>${aft.map((d) => esc(`${d.name} ${d.dose}`)).join(", ")}</b> ka time.`, time: "1:30 pm", actions: ["✅ Le li", "⏰ 30 min baad"], handler: "meds:Afternoon" });
    const night = p.doses.filter((d) => d.slot === "Night" && d.ch === "WhatsApp");
    if (night.length) items.push({ from: "asha", html: `🌙 Good evening ${esc(hon(p))}. Khaane ke baad raat ki dawai: <b>${night.map((d) => esc(`${d.name} ${d.dose}`)).join(" aur ")}</b>.`, time: "8:30 pm", actions: ["✅ Le li", "⏰ 30 min baad yaad dilana"], handler: "meds:Night" });
    s.mutate((x) => { x.waDay = s.day; x.waExpect = expect; x.wa.push(...items.map((it) => ({ ...it, id: uid() }))); });
  }
  s.setOverlay("wa");
}

/** Rail button "Doctor visit": the day-before reminder with what to carry. */
export function waDoctor() {
  const s = getState(), p = s.current();
  if (!p) return;
  const v = nextVisit(p, s.baseDate, s.day);
  const d = v?.d || p.pr.doctors[0];
  if (!d) return s.showToast("No doctor added yet.");
  const report = p.reports[0];
  add([
    { day: "Day before the visit" },
    {
      from: "asha",
      time: "6:00 pm",
      html: `🩺 ${esc(hon(p))}, kal <b>${esc(visitText(d) || "")}</b> ${esc(d.name)} ke paas appointment hai.<br><br>Saath le jaana:<br>✔ ${d.tests ? `${esc(d.tests)} report` : "Pichhli report"}${report ? ` (${esc(report.date)})` : ""}<br>✔ Dawaiyon ki list<br>✔ Pichhle 2 hafte ki ${has(p, "fbs") ? "sugar aur " : ""}BP diary (maine bana di hai 📄)${d.tests ? `<br><br>${esc(d.tests)} test ho chuka hai ✓` : ""}`,
      actions: ["👍 Theek hai", "📅 Date badalni hai"],
      handler: `doctor:${d.name}`,
    },
  ]);
  s.setOverlay("wa");
}

function runHandler(p: Person, handler: string, k: number) {
  const s = getState();
  if (handler.startsWith("meds:")) {
    const slot = handler.slice(5);
    const time = slot === "Night" ? "8:41 pm" : "1:34 pm";
    if (k === 0) {
      s.mutate((x) => x.doses.forEach((d) => { if (d.slot === slot && d.ch === "WhatsApp" && !d.taken) d.taken = time; }));
      const allDone = getState().current()!.doses.every((d) => d.taken);
      add([{ from: "asha", html: `Noted 👍 ${allDone ? "Aaj ki saari dawai ho gayi." : ""} ${slot === "Night" ? `Shubh ratri, ${esc(hon(p))} 🙏` : "Shabash!"}`, time }]);
      s.push({ t: "note", ic: "✓", x: `WhatsApp · ${slot.toLowerCase()} medicines marked taken.` });
    } else add([{ from: "asha", html: `Theek hai, 30 minute baad yaad dilaungi. Jawab nahi aaya toh call karungi.`, time }]);
  } else if (handler.startsWith("doctor:")) {
    const name = handler.slice(7);
    add([{ from: "asha", html: k === 0 ? `Kal subah 9 baje phir yaad dila dungi. ${esc(p.pr.cg.name)} ko bhi bata diya hai 🙏` : `Koi baat nahi. ${esc(p.pr.cg.name)} ko bata diya, woh nayi date le lengi.`, time: "6:05 pm" }]);
    s.push({ t: "note", ic: "🩺", x: `Doctor visit reminder sent for <b>${esc(name)}</b>.` });
  }
}

export function WhatsAppScreen() {
  const p = useStore((s) => s.current())!;
  const setOverlay = useStore((s) => s.setOverlay);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [p.wa.length]);

  const tap = async (m: WaItem, k: number) => {
    if (m.used) return;
    getState().mutate((x) => { const it = x.wa.find((y) => y.id === m.id); if (it) it.used = true; });
    add([{ from: "me", html: esc(m.actions![k]), time: m.time }]);
    await new Promise((r) => setTimeout(r, 700));
    runHandler(p, m.handler || "", k);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText("");
    add([{ from: "me", html: esc(v), time: "7:42 am" }]);
    await new Promise((r) => setTimeout(r, 700));
    const rid = getState().current()!.waExpect;
    if (!rid) return add([{ from: "asha", html: "Note kar liya 👍 Kuch zaroori ho toh mujhe call bhi kar sakte hain.", time: "now" }]);
    const res = judge(rid, v);
    if (!res) return add([{ from: "asha", html: `Sirf number likhiye, jaise ${READ[rid].def}`, time: "7:42 am" }]);
    logReading(p.id, rid, v);
    getState().mutate((x) => void (x.waExpect = null));
    const cur = getState().current()!;
    const rep = readingReply(cur, rid, res);
    add([{ from: "asha", html: rep.chat, time: "7:43 am" }]);
    getState().push({ t: "note", ic: "✓", x: `WhatsApp · ${esc(READ[rid].name)} <b>${esc(v)}</b> logged.` });
    if (rep.alert) familyNote(cur, `${READ[rid].name} ${v} on WhatsApp today.`);
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-wa-bg">
      <div className="flex items-center gap-2.5 bg-wa-bar px-3 py-3 text-[#F1F6F4]">
        <button aria-label="Back to app" onClick={() => setOverlay(null)} className="grid h-10 w-10 place-items-center p-2.5">{Icon.back}</button>
        <Avatar size={38} />
        <div><strong className="block text-[17px]">Sister Nia</strong><span className="text-[13px] opacity-80">Chatting with {p.pr.name}</span></div>
      </div>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        <span className="self-center rounded-lg bg-warm-soft px-2.5 py-0.5 text-xs font-bold text-warm">Simulated WhatsApp</span>
        {p.wa.map((m) =>
          m.day ? <span key={m.id} className="self-center rounded-lg bg-wa-them px-2.5 py-0.5 text-xs text-muted">{m.day}</span> : (
            <div key={m.id} className={`max-w-[84%] rounded-xl px-3 pb-1.5 pt-2 text-base shadow-sm ${m.from === "me" ? "self-end rounded-tr-sm bg-wa-me" : "self-start rounded-tl-sm bg-wa-them"}`}>
              <div className="rich" dangerouslySetInnerHTML={{ __html: m.html || "" }} />
              {m.actions && (
                <div className="mt-2 flex flex-col border-t border-line">
                  {m.actions.map((a, k) => <button key={k} disabled={m.used} onClick={() => tap(m, k)} className="p-2 font-bold text-accent disabled:text-muted">{a}</button>)}
                </div>
              )}
              <time className="block text-right text-[11px] text-muted">{m.time}{m.from === "me" ? " ✓✓" : ""}</time>
            </div>
          ),
        )}
      </div>
      <form className="flex gap-2 border-t border-line bg-wa-bg p-2" onSubmit={send}>
        <input id="wa-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={p.waExpect ? `Reading likhiye, e.g. ${READ[p.waExpect].def}` : "Message"} inputMode={p.waExpect ? "decimal" : "text"} aria-label="WhatsApp message" className="min-w-0 flex-1 rounded-full bg-wa-them px-4 py-3" />
        <button aria-label="Send" className="grid h-[46px] w-[46px] flex-none place-items-center rounded-full bg-wa-green p-3 text-white">{Icon.waSend}</button>
      </form>
    </div>
  );
}
