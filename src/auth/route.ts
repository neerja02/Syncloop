import { useEffect, useState } from "react";

/** The app's pages, kept in the address bar's hash so Back and refresh work. */
export type Route = "home" | "login" | "signup" | "app";

const read = (): Route => {
  const h = location.hash.replace(/^#\/?/, "");
  return h === "login" || h === "signup" || h === "app" ? h : "home";
};

export const go = (r: Route) => {
  const hash = r === "home" ? "" : `#${r}`;
  if (location.hash === hash || (!hash && !location.hash)) return;
  if (hash) { location.hash = hash; return; }
  history.pushState(null, "", location.pathname + location.search);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

export function useRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    window.addEventListener("popstate", on);
    return () => { window.removeEventListener("hashchange", on); window.removeEventListener("popstate", on); };
  }, []);
  return route;
}
