import { useEffect } from "react";
import { startDayIfNeeded } from "../../agent/flows";
import { useStore, type Tab } from "../../store/useStore";
import { Wizard } from "../onboarding/Wizard";
import { CallScreen } from "../sim/CallScreen";
import { SosScreen } from "../sim/SosScreen";
import { WhatsAppScreen } from "../sim/WhatsAppScreen";
import { HealthTab } from "../tabs/HealthTab";
import { ProfileTab } from "../tabs/ProfileTab";
import { TalkTab } from "../tabs/TalkTab";
import { TodayTab } from "../tabs/TodayTab";
import { Avatar, Icon, Toast } from "../ui/ui";

const TABS: [Tab, string, JSX.Element][] = [
  ["talk", "Talk", Icon.talk],
  ["today", "Today", Icon.today],
  ["health", "Health", Icon.health],
  ["profile", "Profile", Icon.profile],
];

export function Phone() {
  const { people, cur, tab, overlay, day, setTab, setCur, openOnboarding, openSos } = useStore();
  const p = people[cur];

  // Nia starts the conversation herself each day, for whoever is selected.
  useEffect(() => {
    if (p && overlay !== "ob") startDayIfNeeded();
  }, [p?.id, day, overlay, p]);

  return (
    <section aria-label="Sister Nia app" className="relative mx-auto flex h-[min(820px,calc(100dvh-48px))] min-h-[620px] w-full max-w-[420px] flex-col overflow-hidden rounded-[28px] border border-line bg-surface shadow-phone">
      <header className="flex flex-col gap-2.5 border-b border-line bg-surface px-4 pb-2.5 pt-3.5">
        <div className="flex items-center gap-3">
          <Avatar online />
          <div>
            <h1 className="font-display text-[21px] font-semibold leading-tight">Sister Nia</h1>
            <p className="text-sm text-muted">{p ? `Your nurse · knows ${p.pr.first} ji's health` : "Your nurse"}</p>
          </div>
          {p && (
            <button onClick={openSos} aria-label="SOS: emergency call to family" className="ml-auto flex h-[52px] w-[52px] flex-none flex-col items-center justify-center rounded-full bg-[#C8432C] text-[15px] font-extrabold leading-none tracking-wide text-white shadow-[0_0_0_4px_rgba(200,67,44,.18)]">
              SOS
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Whose health">
          {people.map((x, i) => (
            <button key={x.id} aria-pressed={i === cur} onClick={() => setCur(i)} className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[15px] ${i === cur ? "border-accent bg-accent font-bold text-accent-ink" : "border-line bg-surface2"}`}>
              {x.pr.rel || x.pr.first} · {x.pr.first}
            </button>
          ))}
          <button onClick={() => openOnboarding(null)} className="whitespace-nowrap rounded-full border border-dashed border-line bg-surface2 px-3.5 py-1.5 text-[15px] text-muted">+ Add family member</button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col bg-surface2">
        {p && tab === "talk" && <TalkTab />}
        {p && tab === "today" && <TodayTab />}
        {p && tab === "health" && <HealthTab />}
        {p && tab === "profile" && <ProfileTab />}
      </main>

      <nav role="tablist" className="grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        {TABS.map(([k, label, icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex flex-col items-center gap-0.5 px-1 pb-2.5 pt-2 text-sm ${tab === k ? "font-bold text-accent" : "text-muted"}`}>
            <span className="h-6 w-6">{icon}</span>{label}
          </button>
        ))}
      </nav>

      <Toast />
      {overlay === "call" && p && <CallScreen />}
      {overlay === "wa" && p && <WhatsAppScreen />}
      {overlay === "sos" && p && <SosScreen />}
      {overlay === "ob" && <Wizard key={String(useStore.getState().obEdit)} />}
    </section>
  );
}
