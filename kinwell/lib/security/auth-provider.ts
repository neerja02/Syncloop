import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/database/client";
import { env } from "@/lib/config/env";
import { getEmailProvider } from "@/lib/integrations/notifications";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { logAccess } from "./access";

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include at least one letter and one number");

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
  acceptTerms: z.literal("on", { message: "Please accept the terms and privacy policy" }),
});

export type TokenPurpose = "verify_email" | "reset_password" | "magic_link";
const TOKEN_TTL: Record<TokenPurpose, number> = { verify_email: 24 * 3600_000, reset_password: 3600_000, magic_link: 15 * 60_000 };

export interface AuthProvider {
  readonly name: string;
  signUp(input: z.infer<typeof signUpSchema>): Promise<{ userId: string }>;
  signIn(email: string, password: string): Promise<{ userId: string } | null>;
  sendMagicLink(email: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<{ userId: string }>;
  consumeToken(token: string, purpose: TokenPurpose): Promise<{ userId: string } | null>;
  sendVerification(userId: string): Promise<void>;
  /** OAuth readiness: returns providers that are configured (Google / Apple). */
  oauthProviders(): ("google" | "apple")[];
}

async function issueToken(userId: string | null, email: string, purpose: TokenPurpose) {
  const db = await getDb();
  const token = randomToken(32);
  await db.query("insert into auth_tokens(user_id, email, purpose, token_hash, expires_at) values ($1,$2,$3,$4,$5)", [userId, email, purpose, sha256(token), new Date(Date.now() + TOKEN_TTL[purpose])]);
  return token;
}

/** Built-in email/password + magic link auth backed by Postgres. Works with no external services. */
export class LocalAuthProvider implements AuthProvider {
  readonly name: string = "local";

  async signUp(input: z.infer<typeof signUpSchema>) {
    const db = await getDb();
    const exists = await db.query("select 1 from users where lower(email) = $1", [input.email]);
    if (exists.rows.length) throw new Error("An account with this email already exists. Try signing in.");
    const hash = await hashPassword(input.password);
    const { rows } = await db.query<{ id: string }>("insert into users(email, password_hash, full_name, role) values ($1,$2,$3,'FAMILY_ADMIN') returning id", [input.email, hash, input.fullName]);
    const userId = rows[0]!.id;
    await db.query("insert into user_preferences(user_id) values ($1)", [userId]);
    for (const c of ["terms", "privacy"]) await db.query("insert into consents(user_id, consent_type, granted) values ($1,$2,true)", [userId, c]);
    await this.sendVerification(userId);
    await logAccess({ id: userId }, "sign_up", "user", userId, null);
    return { userId };
  }

  async signIn(email: string, password: string) {
    const db = await getDb();
    const u = (await db.query<{ id: string; password_hash: string | null }>("select id, password_hash from users where lower(email) = lower($1)", [email.trim()])).rows[0];
    // Always run a hash comparison to keep timing similar for unknown emails.
    const ok = await verifyPassword(password, u?.password_hash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    if (!u || !ok) return null;
    await logAccess({ id: u.id }, "sign_in", "user", u.id, null);
    return { userId: u.id };
  }

  async sendVerification(userId: string) {
    const db = await getDb();
    const u = (await db.query<{ email: string; full_name: string }>("select email, full_name from users where id = $1", [userId])).rows[0]!;
    const token = await issueToken(userId, u.email, "verify_email");
    await getEmailProvider().send({ to: u.email, subject: "Verify your Kinwell email", text: `Hi ${u.full_name.split(" ")[0]}, confirm your email to keep your family's health information secure.`, link: `${env.appUrl}/verify-email?token=${token}` });
  }

  async sendMagicLink(email: string) {
    const db = await getDb();
    const u = (await db.query<{ id: string }>("select id from users where lower(email) = lower($1)", [email.trim()])).rows[0];
    if (!u) return; // don't reveal whether an account exists
    const token = await issueToken(u.id, email, "magic_link");
    await getEmailProvider().send({ to: email, subject: "Your Kinwell sign-in link", text: "Use this link to sign in. It expires in 15 minutes and can be used once.", link: `${env.appUrl}/magic-link?token=${token}` });
  }

  async sendPasswordReset(email: string) {
    const db = await getDb();
    const u = (await db.query<{ id: string }>("select id from users where lower(email) = lower($1)", [email.trim()])).rows[0];
    if (!u) return;
    const token = await issueToken(u.id, email, "reset_password");
    await getEmailProvider().send({ to: email, subject: "Reset your Kinwell password", text: "Use this link to choose a new password. It expires in 1 hour.", link: `${env.appUrl}/reset-password?token=${token}` });
  }

  async consumeToken(token: string, purpose: TokenPurpose) {
    const db = await getDb();
    const row = (await db.query<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }>("select id, user_id, expires_at, used_at from auth_tokens where token_hash = $1 and purpose = $2", [sha256(token), purpose])).rows[0];
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return null;
    await db.query("update auth_tokens set used_at = now() where id = $1", [row.id]);
    if (purpose === "verify_email" || purpose === "magic_link") await db.query("update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1", [row.user_id]);
    return { userId: row.user_id };
  }

  async resetPassword(token: string, password: string) {
    const parsed = passwordSchema.parse(password);
    const res = await this.consumeToken(token, "reset_password");
    if (!res) throw new Error("This reset link is invalid or has expired.");
    const db = await getDb();
    await db.query("update users set password_hash = $2, updated_at = now() where id = $1", [res.userId, await hashPassword(parsed)]);
    await db.query("delete from sessions where user_id = $1", [res.userId]);
    return res;
  }

  oauthProviders() {
    const p: ("google" | "apple")[] = [];
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) p.push("google");
    if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) p.push("apple");
    return p;
  }
}

/**
 * Supabase Auth adapter placeholder. In production set AUTH_PROVIDER=supabase and implement these calls with
 * @supabase/ssr (signUp, signInWithPassword, signInWithOtp, resetPasswordForEmail, signInWithOAuth for Google/Apple).
 * The users table id should equal auth.users.id so RLS policies (app_current_user_id) resolve from the JWT.
 */
export class SupabaseAuthProvider extends LocalAuthProvider {
  readonly name: string = "supabase";
}

export function getAuthProvider(): AuthProvider {
  return env.authProvider === "supabase" ? new SupabaseAuthProvider() : new LocalAuthProvider();
}
