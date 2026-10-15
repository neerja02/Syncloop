import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/auth";
import { go } from "../../auth/route";
import { Avatar } from "../ui/ui";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { login, signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Google sends people back here with ?auth_error=… when sign-in fails; show it once, then tidy the address.
  const [error, setError] = useState(() => {
    const msg = new URLSearchParams(location.search).get("auth_error") || "";
    if (msg) history.replaceState(null, "", location.pathname + location.hash);
    return msg;
  });
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const err = isSignup ? await signup(name, email, password) : await login(email, password);
    setBusy(false);
    if (err) setError(err);
    else go("app");
  };

  const switchTo = (m: "login" | "signup") => { setError(""); go(m); };

  return (
    <div className="flex min-h-full flex-col items-center px-4 py-8">
      <button onClick={() => go("home")} className="mb-8 flex items-center gap-2.5 self-center rounded-full">
        <Avatar size={38} />
        <span className="font-display text-xl font-semibold">Sister Nia</span>
      </button>

      <main className="w-full max-w-[420px] rounded-[32px] bg-surface px-7 py-8 shadow-phone max-[420px]:px-5">
        <h1 className="font-display text-[28px] font-semibold leading-tight">{isSignup ? "Create your family account" : "Welcome back"}</h1>
        <p className="mt-1.5 text-muted">
          {isSignup ? "Set up Sister Nia for your parents or grandparents. It takes about five minutes." : "Log in to see today's medicines, readings and Nia's check-ins."}
        </p>

        <a href="/api/auth/google" className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-3 rounded-full border-[1.5px] border-line bg-surface px-5 py-2.5 font-bold text-ink hover:bg-surface2">
          <GoogleG />
          {isSignup ? "Sign up with Google" : "Continue with Google"}
        </a>

        <div className="my-5 flex items-center gap-3 text-sm text-muted" aria-hidden>
          <span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {isSignup && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-name" className="text-[15px] font-bold">Your name</label>
              <input id="auth-name" className="field-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neha Sharma" required />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-email" className="text-[15px] font-bold">Email</label>
            <input id="auth-email" type="email" className="field-input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-password" className="text-[15px] font-bold">Password</label>
            <input id="auth-password" type="password" className="field-input" autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required aria-describedby={isSignup ? "auth-pw-hint" : undefined} />
            {isSignup && <span id="auth-pw-hint" className="text-sm text-muted">At least 8 characters.</span>}
          </div>

          {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-[15px] text-bad">{error}</p>}

          <button type="submit" className="btn mt-1 w-full" disabled={busy}>
            {busy ? (isSignup ? "Creating account…" : "Logging in…") : isSignup ? "Sign up" : "Log in"}
          </button>
        </form>

        <p className="mt-5 text-center text-[15px] text-muted">
          {isSignup ? "Already have an account? " : "New to Sister Nia? "}
          <button className="font-bold text-accent underline underline-offset-2" onClick={() => switchTo(isSignup ? "login" : "signup")}>
            {isSignup ? "Log in" : "Sign up"}
          </button>
        </p>
      </main>

      <p className="mt-6 max-w-[420px] text-center text-[13px] text-muted">Sister Nia is a health companion, not a doctor. In an emergency, call 112.</p>
    </div>
  );
}

/** Google's "G" mark, as their sign-in button guidelines ask. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 flex-none" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
