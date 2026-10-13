import { useEffect } from "react";
import { Guide } from "./components/layout/Guide";
import { Phone } from "./components/layout/Phone";
import { TestRail } from "./components/layout/TestRail";
import { useStore } from "./store/useStore";

export default function App() {
  const people = useStore((s) => s.people.length);
  const overlay = useStore((s) => s.overlay);
  const openOnboarding = useStore((s) => s.openOnboarding);
  const setOverlay = useStore((s) => s.setOverlay);

  // First visit: setup. Returning visit: straight to Asha (and close any half-open call).
  useEffect(() => {
    if (!people && overlay !== "ob") openOnboarding(null);
    if (people && (overlay === "call" || overlay === "wa")) setOverlay(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-4 py-6">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,420px)_96px_minmax(0,1fr)] items-start gap-6 max-[960px]:grid-cols-[minmax(0,420px)_96px] max-[620px]:grid-cols-1">
        <Phone />
        <TestRail />
        <Guide />
      </div>
    </div>
  );
}
