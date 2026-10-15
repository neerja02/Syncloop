import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type RequestHandler, type Response } from "express";

/**
 * Accounts for the family members who use Sister Nia.
 * Users live in server/data/users.json (passwords hashed with scrypt). The session is a signed cookie,
 * so restarting the server keeps everyone signed in.
 */

/** `hash` is empty for accounts made with Google, which then can't log in with a password. */
interface User { id: string; name: string; email: string; salt: string; hash: string; googleId?: string; createdAt: string }
export interface PublicUser { id: string; name: string; email: string }

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, "data");
const USERS = path.join(DATA, "users.json");
const COOKIE = "nia_session";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days, in seconds

mkdirSync(DATA, { recursive: true });

// Set SESSION_SECRET in .env for a fixed secret; otherwise one is made once and kept in server/data.
const SECRET = process.env.SESSION_SECRET || (() => {
  const file = path.join(DATA, "session-secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  return readFileSync(file, "utf8").trim();
})();

const load = (): User[] => {
  try { return JSON.parse(readFileSync(USERS, "utf8")) as User[]; } catch { return []; }
};
const save = (users: User[]) => {
  const tmp = `${USERS}.tmp`;
  writeFileSync(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  renameSync(tmp, USERS);
};

const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 64).toString("hex");
const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
const sign = (v: string) => createHmac("sha256", SECRET).update(v).digest("hex");
const pub = (u: User): PublicUser => ({ id: u.id, name: u.name, email: u.email });

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

function setSession(req: Request, res: Response, userId: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const value = `${userId}.${exp}`;
  res.cookie(COOKIE, `${value}.${sign(value)}`, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: MAX_AGE * 1000, path: "/" });
}

/** The signed-in user for this request, or null. */
export function sessionUser(req: Request): User | null {
  const [id, exp, sig] = readCookie(req, COOKIE).split(".");
  if (!id || !exp || !sig || !sameHex(sig, sign(`${id}.${exp}`))) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return load().find((u) => u.id === id) ?? null;
}

/** Blocks a route unless someone is signed in. */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!sessionUser(req)) {
    res.status(401).json({ error: "Please log in to use this." });
    return;
  }
  next();
};

// Slow down password guessing: at most 10 failed logins per address every 10 minutes.
const failures = new Map<string, number[]>();
const recentFailures = (ip: string) => {
  const now = Date.now();
  const list = (failures.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  failures.set(ip, list);
  return list;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authRouter = express.Router();
authRouter.use(express.json({ limit: "4kb" }));

authRouter.get("/me", (req, res) => {
  const u = sessionUser(req);
  res.json({ user: u ? pub(u) : null });
});

authRouter.post("/signup", (req, res) => {
  const { name = "", email = "", password = "" } = (req.body ?? {}) as Record<string, string>;
  const cleanName = String(name).trim().slice(0, 80);
  const cleanEmail = String(email).trim().toLowerCase().slice(0, 200);
  if (!cleanName) return void res.status(400).json({ error: "Please enter your name." });
  if (!EMAIL.test(cleanEmail)) return void res.status(400).json({ error: "Please enter a valid email address." });
  if (String(password).length < 8) return void res.status(400).json({ error: "Use a password of at least 8 characters." });
  const users = load();
  if (users.some((u) => u.email === cleanEmail)) return void res.status(409).json({ error: "An account with this email already exists. Log in instead." });
  const salt = randomBytes(16).toString("hex");
  const user: User = { id: randomUUID(), name: cleanName, email: cleanEmail, salt, hash: hashPassword(String(password), salt), createdAt: new Date().toISOString() };
  save([...users, user]);
  setSession(req, res, user.id);
  res.status(201).json({ user: pub(user) });
});

authRouter.post("/login", (req, res) => {
  const ip = req.ip || "unknown";
  if (recentFailures(ip).length >= 10) return void res.status(429).json({ error: "Too many tries. Please wait 10 minutes and try again." });
  const { email = "", password = "" } = (req.body ?? {}) as Record<string, string>;
  const user = load().find((u) => u.email === String(email).trim().toLowerCase());
  if (user && !user.hash) return void res.status(400).json({ error: "This account uses Google. Tap Continue with Google to log in." });
  if (!user || !sameHex(user.hash, hashPassword(String(password), user.salt))) {
    recentFailures(ip).push(Date.now());
    return void res.status(401).json({ error: "That email and password don't match. Check them and try again." });
  }
  setSession(req, res, user.id);
  res.json({ user: pub(user) });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

/* ---------------- Google sign-in (OAuth 2.0, authorization code flow) ---------------- */

const G_ID = process.env.GOOGLE_CLIENT_ID || "";
const G_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
export const googleEnabled = !!(G_ID && G_SECRET);
const STATE_COOKIE = "nia_google_state";

// The address Google sends people back to. It must be listed under "Authorized redirect URIs" in Google Cloud.
const redirectUri = (req: Request) =>
  process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

const backTo = (res: Response, error?: string) =>
  res.redirect(error ? `/?auth_error=${encodeURIComponent(error)}#login` : "/#app");

authRouter.get("/google/status", (_req, res) => res.json({ enabled: googleEnabled }));

authRouter.get("/google", (req, res) => {
  if (!googleEnabled) return void backTo(res, "Google sign-in isn't set up on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.");
  const state = randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 10 * 60_000, path: "/" });
  const q = new URLSearchParams({ client_id: G_ID, redirect_uri: redirectUri(req), response_type: "code", scope: "openid email profile", state, prompt: "select_account" });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
});

authRouter.get("/google/callback", async (req, res) => {
  const { code = "", state = "", error = "" } = req.query as Record<string, string>;
  const expected = readCookie(req, STATE_COOKIE);
  res.clearCookie(STATE_COOKIE, { path: "/" });
  if (error) return void backTo(res, error === "access_denied" ? "Google sign-in was cancelled." : `Google sign-in failed (${error}).`);
  if (!code || !state || state !== expected) return void backTo(res, "Google sign-in expired. Please try again.");
  try {
    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: G_ID, client_secret: G_SECRET, redirect_uri: redirectUri(req), grant_type: "authorization_code" }),
    });
    const tok = (await tr.json()) as { access_token?: string; error_description?: string };
    if (!tr.ok || !tok.access_token) throw new Error(tok.error_description || `token request returned ${tr.status}`);
    const ur = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const g = (await ur.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
    if (!ur.ok || !g.sub || !g.email) throw new Error("no profile returned");
    if (!g.email_verified) return void backTo(res, "Your Google email isn't verified yet. Verify it with Google, or sign up with email and password.");

    const users = load();
    const email = g.email.toLowerCase();
    let user = users.find((u) => u.googleId === g.sub) || users.find((u) => u.email === email);
    if (user) user.googleId = g.sub; // links an existing email account to Google
    else {
      user = { id: randomUUID(), name: (g.name || email.split("@")[0]).slice(0, 80), email, salt: "", hash: "", googleId: g.sub, createdAt: new Date().toISOString() };
      users.push(user);
    }
    save(users);
    setSession(req, res, user.id);
    backTo(res);
  } catch (e) {
    backTo(res, `Google sign-in failed: ${(e as Error).message}`);
  }
});
