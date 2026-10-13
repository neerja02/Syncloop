import "server-only";
import { features } from "@/lib/config/features";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/database/client";
import { env } from "@/lib/config/env";
import { randomToken, sha256 } from "./crypto";
import type { Actor, SessionUser } from "@/types/domain";
import { loadActor, toSessionUser, type UserRow } from "./actor";

export { loadActor, toSessionUser };

export const SESSION_COOKIE = "kw_session";
const SESSION_DAYS = 30;

/** `remember: false` keeps the sign-in only until the browser closes (and at most a day). */
export async function createSession(userId: string, opts: { remember?: boolean } = {}) {
  const remember = opts.remember ?? true;
  const db = await getDb();
  const token = randomToken(32);
  const expires = new Date(Date.now() + (remember ? SESSION_DAYS : 1) * 86400000);
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.query("insert into sessions(user_id, token_hash, expires_at, user_agent) values ($1,$2,$3,$4)", [userId, sha256(token), expires, ua]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    ...(remember ? { expires } : {}),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.query("delete from sessions where token_hash = $1", [sha256(token)]);
  }
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  const db = await getDb();
  await db.query("delete from sessions where user_id = $1", [userId]);
}

/** Resolves the signed-in user for this request (memoised per request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const { rows } = await db.query<UserRow & { session_id: string; expires_at: Date; last_seen_at: Date }>(
    `select u.*, s.id as session_id, s.expires_at, s.last_seen_at from sessions s join users u on u.id = s.user_id where s.token_hash = $1`,
    [sha256(token)],
  );
  const row = rows[0];
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 10 * 60000) {
    await db.query("update sessions set last_seen_at = now() where id = $1", [row.session_id]);
  }
  return toSessionUser(row);
});

export const getActor = cache(async (): Promise<Actor | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  return loadActor(user);
});

/** For patient-facing pages: requires a signed-in user with a family; redirects otherwise. */
export async function requirePatient(): Promise<Actor & { familyId: string }> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role === "DOCTOR" && !actor.familyId) redirect(features.doctorPortal ? "/doctor" : "/login?error=doctor");
  if (actor.role === "ADMIN" && !actor.familyId) redirect("/admin");
  if (!actor.onboardingCompleted || !actor.familyId) redirect("/onboarding");
  return actor as Actor & { familyId: string };
}

export async function requireDoctor(): Promise<Actor & { doctorId: string }> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role !== "DOCTOR" || !actor.doctorId) redirect("/app");
  return actor as Actor & { doctorId: string };
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN") redirect("/app");
  return actor;
}

export async function requireUser(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}
