import { useEffect } from "react";
import { useAuth } from "./auth/auth";
import { go, useRoute } from "./auth/route";
import { Guide } from "./components/layout/Guide";
import { Phone } from "./components/layout/Phone";
import { TestRail } from "./components/layout/TestRail";
import { AuthPage } from "./components/site/AuthPage";
import { Landing } from "./components/site/Landing";
import { Avatar } from "./components/ui/ui";
import { useStore } from "./store/useStore";

export default function App() {
  const status = useAuth((s) => s.status);
  const check = useAuth((s) => s.check);
  const route = useRoute();

  useEffect(() => { void check(); }, [check]);

  // Signed-in people skip the login and signup pages.
  useEffect(() => {
    if (status === "in" && (route === "login" || route === "signup")) go("app");
  }, [status, route]);

  if (status === "checking") return <p className="grid h-full place-items-center text-muted" role="status">Loading Sister Nia…</p>;
  if (route === "app") return status === "in" ? <Workspace /> : <AuthPage mode="login" />;
  if (route === "login" || route === "signup") return status === "in" ? null : <AuthPage mode={route} />;
  return <Landing />;
}

/** The app itself, for a signed-in account. */
function Workspace() {
  const people = useStore((s) => s.people.length);
  const overlay = useStore((s) => s.overlay);
  const openOnboarding = useStore((s) => s.openOnboarding);
  const setOverlay = useStore((s) => s.setOverlay);

  // First visit: setup. Returning visit: straight to Nia (and close any half-open call).
  useEffect(() => {
    if (!people && overlay !== "ob") openOnboarding(null);
    if (people && (overlay === "call" || overlay === "wa")) setOverlay(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-4 pb-6">
      <AccountBar />
      <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,420px)_96px_minmax(0,1fr)] items-start gap-6 max-[960px]:grid-cols-[minmax(0,420px)_96px] max-[620px]:grid-cols-1">
        <Phone />
        <TestRail />
        <Guide />
      </div>
    </div>
  );
}

function AccountBar() {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto mb-4 flex max-w-[1180px] items-center gap-3 border-b border-line py-3">
      <button onClick={() => go("home")} className="flex items-center gap-2 rounded-full" aria-label="Sister Nia home page">
        <Avatar size={30} />
        <span className="font-display text-lg font-semibold max-[380px]:hidden">Sister Nia</span>
      </button>
      <span className="ml-auto min-w-0 truncate text-[15px] text-muted" title={user?.email}>
        Signed in as <b className="text-ink">{user?.name}</b>
      </span>
      <button className="btn-ghost min-h-[40px] flex-none px-4 py-1.5 text-[15px]" onClick={async () => { await logout(); go("home"); }}>
        Log out
      </button>
    </div>
  );
}
