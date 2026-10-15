import type { ReactNode } from "react";
import { useAuth } from "../../auth/auth";
import { go } from "../../auth/route";
import { Avatar, Icon, Ring } from "../ui/ui";

const SECTIONS = [
  ["how", "How it works"],
  ["day", "A day with Nia"],
  ["safety", "Safety"],
  ["faq", "Questions"],
] as const;

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const STEPS = [
  ["Set up a profile once", "Add your parent's conditions, doctors and medicines, or scan a prescription. Nia builds a care plan from it: which readings to collect, how often, and by call or WhatsApp."],
  ["Nia checks in every day", "She calls at the time you choose and talks in Hinglish, Hindi, Punjabi or English. She ticks off medicines, records BP and sugar, and asks about yesterday's problem first."],
  ["The family stays in the loop", "When a medicine is missed twice, a reading is out of range, or calls go unanswered, Nia alerts the family contact. Emergency words make her say call 112 straight away."],
];

const DAY: [string, string, string, "Call" | "WhatsApp"][] = [
  ["8:30 am", "Daily call", "How did you sleep? Morning tablets taken? BP today?", "Call"],
  ["Morning", "Fasting sugar", "A WhatsApp asking for the reading. Reply with the number.", "WhatsApp"],
  ["Night", "Night medicines", "A reminder with a one-tap reply: ✅ Le li.", "WhatsApp"],
  ["Sunday 10:00 am", "Weekly health check", "Sleep, pain, appetite, mood, feet and weight, with a short summary for the family.", "Call"],
  ["Day before a visit", "Doctor visit reminder", "Which tests to get done first, and which papers to carry.", "WhatsApp"],
];

const DOES = ["Follows up like a family nurse", "Collects daily, weekly and monthly readings", "Reminds medicines by call or WhatsApp", "Lines up tests before doctor visits", "Alerts family when something is off"];
const NEVER = ["Prescribes or changes medicines", "Makes medical decisions", "Treats emergencies at home. She says call 112 and alerts the family."];

const FAQ = [
  ["Does Nia replace our doctor?", "No. Nia keeps track of medicines and readings and reminds you about visits. She never prescribes, changes a dose or makes medical decisions. If you ask whether to take an extra tablet, she warns against a double dose and offers to ask the doctor through the family."],
  ["Which languages does Nia speak?", "Hinglish, Hindi, Punjabi and English. You choose the language when you set up each person's profile."],
  ["Can one account look after more than one person?", "Yes. Add Papa, Mummy or anyone else in the family. Each person has their own medicines, readings and history."],
  ["What happens in an emergency?", "If someone says words like chest pain, a fall or breathlessness, Nia tells them to call 112 and alerts the family. The red SOS button counts down for 5 seconds, then calls and WhatsApps up to three emergency contacts with the person's location."],
  ["Where is our information kept?", "Your account (name, email and a protected password) is kept on the Sister Nia server. Health records are saved in the browser you use, separately for each account, so log in on the same device to see them."],
];

function Check() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 py-20 max-[620px]:py-12">
      <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-accent">{eyebrow}</p>
      <h2 id={`${id}-h`} className="mt-1.5 max-w-[24ch] font-display text-[clamp(26px,3.4vw,36px)] font-semibold leading-tight">{title}</h2>
      {intro && <p className="mt-3 max-w-[60ch] text-muted">{intro}</p>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

function HeroGraphic() {
  const stat = (icon: JSX.Element, value: string, unit: string, label: string) => (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-surface/90 px-3 py-2.5">
      <span className="h-5 w-5 text-accent">{icon}</span>
      <span className="font-display text-lg font-semibold leading-none tabular-nums">{value} <span className="text-xs font-normal text-muted">{unit}</span></span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
  const bubble = (who: "nia" | "me", text: string) => (
    <p className={`max-w-[88%] rounded-3xl px-4 py-2.5 text-[15px] ${who === "nia" ? "self-start rounded-bl-lg bg-surface2" : "self-end rounded-br-lg bg-me"}`}>{text}</p>
  );
  return (
    <figure aria-label="Example: Papa's health summary and his daily call with Nia" className="relative mx-auto w-full max-w-[440px] pb-2">
      {/* Mid-century shapes behind the cards */}
      <span aria-hidden className="absolute -right-4 -top-8 h-44 w-44 rounded-full bg-warm-soft" />
      <span aria-hidden className="absolute -left-6 top-40 h-28 w-28 rounded-full border-[14px] border-accent-soft" />
      <span aria-hidden className="absolute bottom-6 right-2 h-14 w-28 rounded-t-full bg-bad-soft" />

      <div className="relative rounded-[32px] bg-gradient-to-br from-accent-soft via-surface to-surface p-5 shadow-phone">
        <div className="flex items-center gap-3.5">
          <span aria-hidden className="grid h-14 w-14 flex-none place-items-center rounded-full bg-surface font-display text-2xl font-semibold text-accent shadow-card">R</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">Papa's health today</p>
            <p className="font-display text-xl font-semibold leading-tight">Ramesh Sharma</p>
            <p className="text-[13px] text-muted">72 years · speaks Hinglish</p>
          </div>
          <div className="flex flex-col items-center">
            <Ring done={3} total={4} />
            <span className="text-[11px] text-muted">medicines</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {stat(Icon.health, "132/84", "mmHg", "Blood pressure")}
          {stat(Icon.today, "112", "mg/dL", "Fasting sugar")}
          {stat(Icon.calendar, "10:30", "am", "Dr. Mehta, in 8 days")}
        </div>
      </div>

      <div className="relative -mt-3 ml-8 flex flex-col gap-2 rounded-[28px] bg-surface p-4 shadow-card max-[420px]:ml-3">
        <div className="mb-1 flex items-center gap-2.5">
          <Avatar size={34} online />
          <span className="text-sm"><b>Sister Nia</b> <span className="text-muted">· daily call, 8:30 am</span></span>
          <span className="ml-auto h-8 w-8 flex-none rounded-full bg-accent p-2 text-accent-ink">{Icon.phone}</span>
        </div>
        {bubble("nia", "Namaste Ramesh ji! Subah ki Amlodipine le li?")}
        {bubble("me", "Haan, le li. BP 132 by 84 aaya.")}
        {bubble("nia", "Bahut accha. Maine note kar liya.")}
      </div>
    </figure>
  );
}

export function Landing() {
  const { status, user, logout } = useAuth();
  const signedIn = status === "in";

  const ctas =
    signedIn ? (
      <button className="btn" onClick={() => go("app")}>Open the app</button>
    ) : (
      <>
        <button className="btn" onClick={() => go("signup")}>Sign up</button>
        <button className="btn-ghost" onClick={() => go("login")}>Log in</button>
      </>
    );

  return (
    <div className="min-h-full">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-3">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5 rounded-full">
            <Avatar size={36} />
            <span className="whitespace-nowrap font-display text-xl font-semibold max-[400px]:text-lg">Sister Nia</span>
          </button>
          <nav aria-label="On this page" className="ml-4 flex gap-1 max-[860px]:hidden">
            {SECTIONS.map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)} className="rounded-full px-3 py-1.5 text-[15px] text-muted hover:bg-surface2 hover:text-ink">{label}</button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {signedIn ? (
              <>
                <span className="text-[15px] text-muted max-[560px]:hidden">Hi, {user?.name.split(" ")[0]}</span>
                <button className="whitespace-nowrap rounded-full px-2 py-2 text-[15px] font-bold text-muted hover:text-ink" onClick={() => void logout()}>Log out</button>
                <button className="btn whitespace-nowrap px-4" onClick={() => go("app")}>Open app</button>
              </>
            ) : (
              <>
                <button className="whitespace-nowrap rounded-full px-3 py-2 text-[15px] font-bold text-accent hover:bg-accent-soft" onClick={() => go("login")}>Log in</button>
                <button className="btn whitespace-nowrap px-4" onClick={() => go("signup")}>Sign up</button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4">
        <section className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-14 pb-16 pt-16 max-[860px]:grid-cols-1 max-[620px]:pt-10">
          <div className="min-w-0">
            <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-accent">Health companion for elderly people</p>
            <h1 className="mt-2 font-display text-[clamp(34px,5vw,54px)] font-semibold leading-[1.08]">A nurse who knows you, calls you, and keeps you on track.</h1>
            <p className="mt-4 max-w-[54ch] text-[19px] text-muted">
              Sister Nia calls your parents every day in a warm Hinglish voice, reminds them about medicines, records their BP and sugar, and tells you when something needs attention. She never prescribes.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">{ctas}</div>
            <p className="mt-4 text-sm text-muted">Live voice calls · WhatsApp reminders · Family alerts · SOS button</p>
          </div>
          <HeroGraphic />
        </section>

        <Section id="how" eyebrow="How it works" title="Set it up once. Nia does the daily follow-up." intro="The family fills in a profile for each person. From then on Nia runs the routine and only asks the family for help when it's needed.">
          <ol className="grid grid-cols-3 gap-5 max-[860px]:grid-cols-1">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex min-w-0 flex-col gap-2 border-t-2 border-accent pt-4">
                <span className="font-display text-[15px] font-semibold text-accent">Step {i + 1}</span>
                <strong className="text-lg">{t}</strong>
                <span className="text-muted">{d}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="day" eyebrow="A day with Nia" title="Small check-ins, at the times you choose." intro="This is the default routine for a person with high BP and diabetes. You can move any check-in between a call and WhatsApp.">
          <div className="overflow-hidden rounded-3xl bg-surface shadow-card">
            {DAY.map(([time, title, text, ch], i) => (
              <div key={title} className={`grid grid-cols-[150px_minmax(0,1fr)_auto] items-start gap-4 px-5 py-4 max-[620px]:grid-cols-[minmax(0,1fr)_auto] max-[620px]:gap-x-3 max-[620px]:gap-y-1 ${i ? "border-t border-line" : ""}`}>
                <span className="font-bold tabular-nums text-accent max-[620px]:col-span-2">{time}</span>
                <div className="min-w-0"><strong className="block">{title}</strong><span className="text-[15px] text-muted">{text}</span></div>
                <span className={`badge ${ch === "Call" ? "tone-acc" : "tone-good"}`}>{ch}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 max-[620px]:grid-cols-1">
            <div className="panel">
              <h3 className="mb-2 font-bold">Nia does</h3>
              <ul className="flex flex-col gap-1.5 text-[15px] text-muted">{DOES.map((x) => <li key={x} className="flex items-start gap-2"><span className="mt-1 text-good"><Check /></span>{x}</li>)}</ul>
            </div>
            <div className="panel">
              <h3 className="mb-2 font-bold">Nia never does</h3>
              <ul className="flex flex-col gap-1.5 text-[15px] text-muted">{NEVER.map((x) => <li key={x} className="flex items-start gap-2"><span className="mt-1 h-4 w-4 flex-none text-bad">{Icon.close}</span>{x}</li>)}</ul>
            </div>
          </div>
        </Section>

        <Section id="safety" eyebrow="Safety" title="Calm in a scare, quick in an emergency.">
          <div className="grid grid-cols-3 gap-5 max-[860px]:grid-cols-1">
            <div className="panel flex flex-col gap-2">
              <span className="badge tone-warn self-start">BP 174/106 mmHg</span>
              <strong>High reading</strong>
              <span className="text-[15px] text-muted">Nia stays calm and asks them to sit and rest. If there is a bad headache, dizziness, chest pain or breathlessness, she says call 112. She alerts the family either way.</span>
            </div>
            <div className="panel flex flex-col gap-2">
              <span className="badge tone-bad self-start">"Seene mein dard"</span>
              <strong>Emergency words</strong>
              <span className="text-[15px] text-muted">Chest pain, a fall or breathlessness: Nia says call 112 now and alerts the family contact at once.</span>
            </div>
            <div className="panel flex flex-col gap-2">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#C8432C] text-[13px] font-extrabold text-white">SOS</span>
              <strong>One red button</strong>
              <span className="text-[15px] text-muted">A 5-second countdown with a big "Cancel, I'm OK", then a call and WhatsApp to up to three emergency contacts with the location.</span>
            </div>
          </div>
        </Section>

        <Section id="faq" eyebrow="Questions" title="What families ask first.">
          <div className="max-w-[760px] overflow-hidden rounded-3xl bg-surface shadow-card">
            {FAQ.map(([q, a], i) => (
              <details key={q} className={`group px-5 py-4 ${i ? "border-t border-line" : ""}`}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                  {q}
                  <span aria-hidden className="h-5 w-5 flex-none rotate-[-90deg] text-muted transition-transform group-open:rotate-[-270deg]">{Icon.back}</span>
                </summary>
                <p className="mt-2 max-w-[65ch] text-muted">{a}</p>
              </details>
            ))}
          </div>
        </Section>

        <section className="mb-14 flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-accent px-8 py-9 text-accent-ink max-[620px]:px-5">
          <div className="min-w-0">
            <h2 className="font-display text-[clamp(24px,3vw,32px)] font-semibold leading-tight">Give your parents a nurse who calls every day.</h2>
            <p className="mt-1.5 opacity-90">Sign up, add a profile, and Nia starts with a short introduction.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {signedIn ? (
              <button className="min-h-[44px] rounded-full bg-surface px-5 py-2.5 font-bold text-accent" onClick={() => go("app")}>Open the app</button>
            ) : (
              <>
                <button className="min-h-[44px] rounded-full bg-surface px-5 py-2.5 font-bold text-accent" onClick={() => go("signup")}>Sign up</button>
                <button className="min-h-[44px] rounded-full border-[1.5px] border-current px-5 py-2.5 font-bold" onClick={() => go("login")}>Log in</button>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-[13px] text-muted">
          <span>Sister Nia is a health companion, not a doctor. In an emergency, call 112.</span>
          <span>Voice by ElevenLabs</span>
        </div>
      </footer>
    </div>
  );
}
