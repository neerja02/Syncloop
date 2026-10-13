"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { getDb } from "@/lib/database/client";
import { destroyAllSessions, destroySession } from "@/lib/security/session";
import { hashPassword, verifyPassword } from "@/lib/security/crypto";
import { passwordSchema } from "@/lib/security/auth-provider";
import { deleteAccount } from "@/lib/services/privacy";
import { SUPPORTED_COUNTRIES } from "@/lib/clinical/emergency-config";

const refresh = () => revalidatePath("/", "layout");

export async function updateAccountAction(input: { fullName: string; countryCode: string }) {
  return run(async (actor) => {
    const d = z.object({ fullName: z.string().trim().min(2).max(80), countryCode: z.enum(SUPPORTED_COUNTRIES.map((c) => c.code) as [string, ...string[]]) }).parse(input);
    const db = await getDb();
    await db.query("update users set full_name = $2, country_code = $3, updated_at = now() where id = $1", [actor.id, d.fullName, d.countryCode]);
    if (actor.familyId && actor.familyRole === "FAMILY_ADMIN") await db.query("update families set country_code = $2 where id = $1", [actor.familyId, d.countryCode]);
    refresh();
  });
}

const prefsSchema = z.object({
  notifications: z.record(z.string(), z.boolean()).optional(),
  glucoseUnit: z.enum(["mg/dL", "mmol/L"]).optional(),
  dailyCheckInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  largeText: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
});

export async function updatePreferencesAction(input: unknown) {
  return run(async (actor) => {
    const p = prefsSchema.parse(input);
    const db = await getDb();
    await db.query("insert into user_preferences(user_id) values ($1) on conflict do nothing", [actor.id]);
    await db.query(
      `update user_preferences set notifications = coalesce(notifications || $2::jsonb, notifications), glucose_unit = coalesce($3, glucose_unit), daily_check_in_time = coalesce($4, daily_check_in_time),
        large_text = coalesce($5, large_text), high_contrast = coalesce($6, high_contrast), reduce_motion = coalesce($7, reduce_motion), updated_at = now() where user_id = $1`,
      [actor.id, p.notifications ? JSON.stringify(p.notifications) : null, p.glucoseUnit ?? null, p.dailyCheckInTime ?? null, p.largeText ?? null, p.highContrast ?? null, p.reduceMotion ?? null],
    );
    refresh();
  });
}

export async function updateLocationAction(input: { permission: "granted" | "denied"; latitude?: number; longitude?: number; label?: string }) {
  return run(async (actor) => {
    const db = await getDb();
    const lat = input.permission === "granted" && Number.isFinite(input.latitude) ? Math.round(input.latitude! * 100) / 100 : null;
    const lon = input.permission === "granted" && Number.isFinite(input.longitude) ? Math.round(input.longitude! * 100) / 100 : null;
    await db.query("insert into user_preferences(user_id) values ($1) on conflict do nothing", [actor.id]);
    await db.query("update user_preferences set location_permission = $2, latitude = $3, longitude = $4, location_label = $5, updated_at = now() where user_id = $1", [actor.id, input.permission, lat, lon, input.permission === "granted" ? (input.label ?? "Your location").slice(0, 60) : null]);
    await db.query("insert into consents(user_id, consent_type, granted) values ($1,'location',$2)", [actor.id, input.permission === "granted"]);
    refresh();
  });
}

export async function setConsentAction(type: "ai_processing" | "doctor_sharing" | "research", granted: boolean) {
  return run(async (actor) => {
    const db = await getDb();
    await db.query("update consents set revoked_at = now() where user_id = $1 and consent_type = $2 and revoked_at is null", [actor.id, type]);
    await db.query("insert into consents(user_id, consent_type, granted) values ($1,$2,$3)", [actor.id, type, granted]);
    refresh();
  });
}

export async function changePasswordAction(current: string, next: string) {
  return run(async (actor) => {
    const db = await getDb();
    const u = (await db.query<{ password_hash: string | null }>("select password_hash from users where id = $1", [actor.id])).rows[0];
    if (!(await verifyPassword(current, u?.password_hash))) throw new Error("Your current password is incorrect.");
    const p = passwordSchema.parse(next);
    await db.query("update users set password_hash = $2, updated_at = now() where id = $1", [actor.id, await hashPassword(p)]);
  });
}

export async function signOutEverywhereAction() {
  const r = await run(async (actor) => destroyAllSessions(actor.id));
  if (r.ok) redirect("/login");
  return r;
}

export async function deleteAccountAction(confirm: string) {
  const r = await run(async (actor) => {
    if (confirm !== "DELETE") throw new Error('Type DELETE to confirm.');
    await deleteAccount(actor);
  });
  if (r.ok) {
    await destroySession();
    redirect("/?deleted=1");
  }
  return r;
}

export async function toggleIntegrationAction(kind: "wearable" | "lab" | "pharmacy" | "calendar" | "ehr" | "weather", provider: string, connect: boolean) {
  return run(async (actor) => {
    const db = await getDb();
    await db.query(
      `insert into integrations(user_id, kind, provider, status) values ($1,$2,$3,$4) on conflict (user_id, kind, provider) do update set status = excluded.status`,
      [actor.id, kind, provider, connect ? "connected" : "disconnected"],
    );
    refresh();
  });
}
