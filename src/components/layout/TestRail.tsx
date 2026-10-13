import { isBusy, startDayIfNeeded, testHighReading } from "../../agent/flows";
import { useStore } from "../../store/useStore";
import { waDaily, waDoctor } from "../sim/WhatsAppScreen";
import { Icon } from "../ui/ui";

const ITEMS = [
  { k: "call", label: "Daily call", icon: Icon.phone, tone: "bg-accent-soft text-accent" },
  { k: "wa", label: "WhatsApp", icon: Icon.chat, tone: "bg-good-soft text-wa-green" },
  { k: "weekly", label: "Weekly check", icon: Icon.calendar, tone: "bg-accent-soft text-accent" },
  { k: "doctor", label: "Doctor visit", icon: Icon.doctor, tone: "bg-warm-soft text-warm" },
  { k: "high", label: "High reading", icon: Icon.alert, tone: "bg-bad-soft text-bad" },
  { k: "next", label: "Next day", icon: Icon.next, tone: "bg-same-soft text-ink" },
  { k: "reset", label: "Start over", icon: Icon.reset, tone: "bg-same-soft text-ink" },
] as const;

export function TestRail() {
  const { people, overlay, openCall, setOverlay, setTab, nextDay, reset } = useStore();
  const ready = people.length > 0 && overlay !== "ob";

  const run = (k: (typeof ITEMS)[number]["k"]) => {
    if (k === "reset") {
      if (overlay === "call") return;
      try { localStorage.removeItem("sister-asha-v1"); } catch { /* ignore */ }
      reset();
      return;
    }
    if (!ready) return;
    if (overlay) setOverlay(null);
    if (k === "call") openCall("daily");
    if (k === "weekly") openCall("weekly");
    if (k === "wa") waDaily();
    if (k === "doctor") waDoctor();
    if (k === "high") { setTab("talk"); testHighReading(); }
    if (k === "next") {
      if (isBusy()) return;
      nextDay();
      setTab("talk");
      setTimeout(startDayIfNeeded, 0);
    }
  };

  return (
    <nav aria-label="Test the agent" className="flex flex-col gap-2.5 max-[620px]:order-first max-[620px]:flex-row max-[620px]:overflow-x-auto min-[621px]:sticky min-[621px]:top-6">
      <p className="text-center text-[11px] font-bold uppercase tracking-[0.08em] text-muted max-[620px]:hidden">Test</p>
      {ITEMS.map((it) => (
        <button
          key={it.k}
          onClick={() => run(it.k)}
          disabled={it.k !== "reset" && !ready}
          className="flex flex-col items-center gap-1.5 rounded-[18px] border border-line bg-surface px-1.5 pb-2 pt-2.5 text-center text-xs leading-tight hover:border-accent disabled:opacity-45 max-[620px]:min-w-[84px]"
        >
          <span className={`grid h-[42px] w-[42px] place-items-center rounded-full p-2.5 ${it.tone}`}>{it.icon}</span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}
