/**
 * Stand-in for `next/navigation`, built on the browser History API so the components work in any React app.
 *
 * Using React Router? Replace this file with:
 *   import { useLocation, useNavigate, useSearchParams as useRRSearchParams } from "react-router";
 *   export const usePathname = () => useLocation().pathname;
 *   export const useSearchParams = () => useRRSearchParams()[0];
 *   export function useRouter() {
 *     const navigate = useNavigate();
 *     // Keep the object stable (useMemo): components use `router` in effect dependencies.
 *     return useMemo(() => ({ push: (h: string) => navigate(h), replace: (h: string) => navigate(h, { replace: true }),
 *              back: () => navigate(-1), forward: () => navigate(1), refresh: () => {}, prefetch: () => {} }), [navigate]);
 *   }
 */
import { useMemo, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") window.addEventListener("popstate", emit);
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Called by `router.refresh()`. Next.js re-fetches server data here; register your own re-fetch. */
export const refreshListeners = new Set<() => void>();

export function navigate(href: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
  emit();
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
}

export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** One stable object, like Next.js: components list `router` in effect dependencies. */
const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href, { replace: true }),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => refreshListeners.forEach((l) => l()),
  prefetch: (_href: string) => {},
};

export function useRouter() {
  return router;
}
