"use server";
import { features } from "@/lib/config/features";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuthProvider, passwordSchema, signUpSchema } from "@/lib/security/auth-provider";
import { createSession, destroySession, getSessionUser } from "@/lib/security/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { getDb } from "@/lib/database/client";

export type FormState = { error?: string | null; ok?: boolean; message?: string | null; fields?: Record<string, string> } | null;

async function clientKey(extra: string) {
  const h = await headers();
  return `${h.get("x-forwarded-for")?.split(",")[0] ?? "local"}:${extra}`;
}

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : null;
}

async function homeFor(userId: string) {
  const db = await getDb();
  const u = (await db.query<{ role: string; onboarding_completed_at: Date | null }>("select role, onboarding_completed_at from users where id = $1", [userId])).rows[0]!;
  if (u.role === "DOCTOR") return features.doctorPortal ? "/doctor" : "/login?error=doctor";
  if (u.role === "ADMIN") return "/admin";
  return u.onboarding_completed_at ? "/app" : "/onboarding";
}

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!rateLimit(await clientKey(`signin:${email.toLowerCase()}`), 8, 10 * 60_000).ok) return { error: "Too many attempts. Please wait a few minutes and try again.", fields: { email } };
  if (!email || !password) return { error: "Enter your email and password.", fields: { email } };
  const res = await getAuthProvider().signIn(email, password);
  if (!res) return { error: "That email and password don't match our records.", fields: { email } };
  if (!features.doctorPortal) {
    const role = (await (await getDb()).query<{ role: string; has_family: boolean }>("select u.role, exists(select 1 from family_memberships m where m.user_id = u.id) as has_family from users u where u.id = $1", [res.userId])).rows[0];
    if (role?.role === "DOCTOR" && !role.has_family) return { error: "Doctor accounts aren't part of this version of Kinwell. Please sign in with a personal account.", fields: { email } };
  }
  await createSession(res.userId, { remember: form.get("remember") === "on" });
  redirect(safeNext(form.get("next")) ?? (await homeFor(res.userId)));
}

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(form.entries());
  if (!rateLimit(await clientKey("signup"), 10, 60 * 60_000).ok) return { error: "Too many sign-ups from this network. Please try later." };
  if (String(raw.password ?? "") !== String(raw.confirmPassword ?? "")) return { error: "The passwords don't match.", fields: { fullName: String(raw.fullName ?? ""), email: String(raw.email ?? "") } };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form.", fields: { fullName: String(raw.fullName ?? ""), email: String(raw.email ?? "") } };
  try {
    const { userId } = await getAuthProvider().signUp(parsed.data);
    await createSession(userId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create your account.", fields: { fullName: parsed.data.fullName, email: parsed.data.email } };
  }
  redirect("/onboarding");
}

export async function magicLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { error: "Enter a valid email." };
  if (!rateLimit(await clientKey(`magic:${email.data}`), 5, 15 * 60_000).ok) return { error: "Too many requests. Please wait a few minutes." };
  await getAuthProvider().sendMagicLink(email.data);
  return { ok: true, message: "If an account exists for that email, a sign-in link is on its way. It expires in 15 minutes." };
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { error: "Enter a valid email." };
  if (!rateLimit(await clientKey(`reset:${email.data}`), 5, 15 * 60_000).ok) return { error: "Too many requests. Please wait a few minutes." };
  await getAuthProvider().sendPasswordReset(email.data);
  return { ok: true, message: "If an account exists for that email, we've sent a link to reset your password." };
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password !== confirm) return { error: "Passwords don't match." };
  const p = passwordSchema.safeParse(password);
  if (!p.success) return { error: p.error.issues[0]?.message };
  try {
    const { userId } = await getAuthProvider().resetPassword(token, password);
    await createSession(userId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't reset password." };
  }
  redirect("/app");
}

export async function resendVerificationAction(): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Please sign in first." };
  if (!rateLimit(`verify:${user.id}`, 3, 15 * 60_000).ok) return { error: "Please wait a few minutes before requesting another email." };
  await getAuthProvider().sendVerification(user.id);
  return { ok: true, message: "Verification email sent." };
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}
