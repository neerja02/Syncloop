const STEPS = [
  ["Set up the profile", 'Tap "Fill sample" to load Ramesh ji, then step through: details, conditions, doctors and medicines, the care plan, and check-in times.'],
  ["First conversation", "Asha introduces herself, explains her routine and asks how he feels. Pick a problem, like knee pain."],
  ["Daily call, live", "Use the call icon and answer. Talk to Asha in Hindi or Hinglish. Say you took Amlodipine, and tell her your BP. Watch the Today tab update."],
  ["WhatsApp", "Reply to the fasting sugar request with a number, then tap the night medicine reminder."],
  ["Next day", "Asha remembers yesterday's knee pain and asks about it first, in chat and on the call."],
  ["Weekly check and doctor visit", "A health check call, and a reminder with the tests and papers to carry."],
  ["High reading", "Enter a high BP, or say 'seene mein dard' on the call. Asha stays calm and alerts the daughter."],
];

export function Guide() {
  return (
    <aside className="flex min-w-0 flex-col gap-6 pt-2 max-[960px]:col-span-full">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-accent">Health companion for elderly people</p>
        <h2 className="mb-2.5 mt-1.5 font-display text-[clamp(26px,3.4vw,36px)] font-semibold leading-tight">A nurse who knows you, calls you, and keeps you on track.</h2>
        <p className="max-w-[56ch] text-muted">
          The family sets up a profile once. After that, Asha checks in every day with a live voice call and WhatsApp, collects BP and sugar readings, reminds medicines, lines up tests before doctor visits, and does a weekly health check. She never prescribes.
        </p>
      </div>
      <div>
        <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-accent">Demo walkthrough</p>
        <ol className="mt-1">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 border-t border-line py-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent">{i + 1}</span>
              <div><strong className="block">{t}</strong><span className="text-[15px] text-muted">{d}</span></div>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
        <div className="panel">
          <h4 className="mb-1.5 text-[15px] font-bold">Asha does</h4>
          <ul className="list-disc pl-4 text-[15px] text-muted">
            <li>Follow up like a family nurse</li><li>Collect daily, weekly and monthly readings</li><li>Remind medicines by call or WhatsApp</li><li>Line up tests before doctor visits</li><li>Alert family when something is off</li>
          </ul>
        </div>
        <div className="panel">
          <h4 className="mb-1.5 text-[15px] font-bold">Asha never does</h4>
          <ul className="list-disc pl-4 text-[15px] text-muted">
            <li>Prescribe or change medicines</li><li>Make medical decisions</li><li>Treat emergencies at home; she says call 112 and alerts family</li>
          </ul>
        </div>
      </div>
      <p className="text-[13px] text-muted">
        Calls use a live ElevenLabs voice agent through the microphone (an offline scripted call is the fallback). WhatsApp and prescription reading are simulated with sample patients. Data stays in this browser.
      </p>
    </aside>
  );
}
