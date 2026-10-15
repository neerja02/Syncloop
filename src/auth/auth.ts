import { create } from "zustand";
import { stopSpeaking } from "../agent/simCall";
import { loadUserData } from "../store/useStore";

export interface User { id: string; name: string; email: string }

interface AuthState {
  status: "checking" | "out" | "in";
  user: User | null;
  /** Asks the server who is signed in (on page load). */
  check: () => Promise<void>;
  /** Each returns an error message to show, or null when it worked. */
  login: (email: string, password: string) => Promise<string | null>;
  signup: (name: string, email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const NO_SERVER = "Can't reach the Sister Nia server. Start it with npm run dev, then try again.";

/**
 * Demo builds (VITE_DEMO_MODE=1) have no server, so accounts live in this browser only.
 * Used for the shareable demo page; the real app always uses the server.
 */
export const DEMO = import.meta.env.VITE_DEMO_MODE === "1";
const DEMO_USERS = "sister-nia-demo-users", DEMO_SESSION = "sister-nia-demo-session";

const store = {
  get: <T,>(k: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? fallback; } catch { return fallback; } },
  set: (k: string, v: unknown) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const digest = async (text: string) => {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return text; }
};

type DemoUser = User & { pw: string };
const demo = {
  async signup(name: string, email: string, password: string) {
    const n = name.trim(), e = email.trim().toLowerCase();
    if (!n) return { error: "Please enter your name." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { error: "Please enter a valid email address." };
    if (password.length < 8) return { error: "Use a password of at least 8 characters." };
    const users = store.get<DemoUser[]>(DEMO_USERS, []);
    if (users.some((u) => u.email === e)) return { error: "An account with this email already exists. Log in instead." };
    const user = { id: `demo-${await digest(e)}`.slice(0, 24), name: n, email: e };
    store.set(DEMO_USERS, [...users, { ...user, pw: await digest(`${e}:${password}`) }]);
    store.set(DEMO_SESSION, user.id);
    return { user };
  },
  async login(email: string, password: string) {
    const e = email.trim().toLowerCase();
    const u = store.get<DemoUser[]>(DEMO_USERS, []).find((x) => x.email === e);
    if (!u || u.pw !== (await digest(`${e}:${password}`))) return { error: "That email and password don't match. Check them and try again." };
    store.set(DEMO_SESSION, u.id);
    return { user: { id: u.id, name: u.name, email: u.email } };
  },
  me(): User | null {
    const id = store.get<string | null>(DEMO_SESSION, null);
    const u = store.get<DemoUser[]>(DEMO_USERS, []).find((x) => x.id === id);
    return u ? { id: u.id, name: u.name, email: u.email } : null;
  },
};

async function post(url: string, body: unknown): Promise<{ user?: User; error?: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => null);
    if (!data) return { error: NO_SERVER };
    return r.ok ? data : { error: data.error || "Something went wrong. Please try again." };
  } catch {
    return { error: NO_SERVER };
  }
}

export const useAuth = create<AuthState>()((set) => {
  const signIn = async (res: { user?: User; error?: string }) => {
    if (!res.user) return res.error || NO_SERVER;
    await loadUserData(res.user.id);
    set({ status: "in", user: res.user });
    return null;
  };

  return {
    status: "checking",
    user: null,
    check: async () => {
      if (DEMO) {
        const user = demo.me();
        if (user) await signIn({ user });
        else set({ status: "out", user: null });
        return;
      }
      try {
        const r = await fetch("/api/auth/me");
        const { user } = (await r.json()) as { user: User | null };
        if (user) { await signIn({ user }); return; }
      } catch { /* server not running: treat as signed out */ }
      set({ status: "out", user: null });
    },
    login: (email, password) => (DEMO ? demo.login(email, password) : post("/api/auth/login", { email, password })).then(signIn),
    signup: (name, email, password) => (DEMO ? demo.signup(name, email, password) : post("/api/auth/signup", { name, email, password })).then(signIn),
    logout: async () => {
      stopSpeaking();
      if (DEMO) store.set(DEMO_SESSION, null);
      else await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      await loadUserData(null);
      set({ status: "out", user: null });
    },
  };
});
