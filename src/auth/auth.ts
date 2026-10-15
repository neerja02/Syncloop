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
      try {
        const r = await fetch("/api/auth/me");
        const { user } = (await r.json()) as { user: User | null };
        if (user) { await signIn({ user }); return; }
      } catch { /* server not running: treat as signed out */ }
      set({ status: "out", user: null });
    },
    login: (email, password) => post("/api/auth/login", { email, password }).then(signIn),
    signup: (name, email, password) => post("/api/auth/signup", { name, email, password }).then(signIn),
    logout: async () => {
      stopSpeaking();
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      await loadUserData(null);
      set({ status: "out", user: null });
    },
  };
});
