"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/database/client";
import { getSessionUser, loadActor } from "@/lib/security/session";
import { createFamily } from "@/lib/services/families";
import { createProfile, addEmergencyContact } from "@/lib/services/profiles";
import { addAllergy, addCondition, saveMedication } from "@/lib/services/health-record";
import { RELATIONSHIPS } from "@/lib/validation/health";
import { SUPPORTED_COUNTRIES } from "@/lib/clinical/emergency-config";

const onboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  sex: z.enum(["female", "male", "intersex", "prefer_not_to_say", ""]).optional(),
  countryCode: z.enum(SUPPORTED_COUNTRIES.map((c) => c.code) as [string, ...string[]]),
  conditions: z.array(z.string().trim().min(1).max(120)).max(20),
  allergies: z.array(z.string().trim().min(1).max(120)).max(20),
  medicines: z.array(z.string().trim().min(1).max(120)).max(20),
  family: z.array(z.object({ name: z.string().trim().min(1).max(60), relationship: z.enum(RELATIONSHIPS), dateOfBirth: z.string().optional() })).max(12),
  emergency: z.object({ name: z.string().trim().max(80), phone: z.string().trim().max(24), relationship: z.string().trim().max(40) }).optional(),
  permissions: z.object({ notifications: z.boolean(), location: z.enum(["granted", "denied", "not_asked"]), latitude: z.number().optional(), longitude: z.number().optional(), camera: z.boolean(), aiConsent: z.boolean() }),
});

export async function completeOnboarding(payload: unknown): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const parsed = onboardingSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  const d = parsed.data;
  if (!d.permissions.aiConsent) return { error: "Please agree to AI processing so the assistant can answer your questions. You can withdraw this later in Settings." };
  const db = await getDb();
  try {
    let actor = await loadActor(user);
    if (!actor.familyId) {
      const last = user.fullName.trim().split(/\s+/).slice(-1)[0];
      await createFamily(user.id, `${last} Family`, d.countryCode);
      actor = await loadActor(user);
    }
    const familyId = actor.familyId!;
    await db.query("update families set country_code = $2 where id = $1", [familyId, d.countryCode]);
    await db.query("update users set country_code = $2 where id = $1", [user.id, d.countryCode]);
    const hasSelf = (await db.query("select id from profiles where family_id = $1 and user_id = $2 and relationship = 'self'", [familyId, user.id])).rows[0] as { id: string } | undefined;
    const self = hasSelf ?? (await createProfile(actor, familyId, { displayName: d.displayName, relationship: "self", dateOfBirth: d.dateOfBirth || null, sex: d.sex || null }, { userId: user.id }));
    for (const c of d.conditions) await addCondition(actor, { profileId: self.id, name: c }, "user");
    for (const a of d.allergies) await addAllergy(actor, { profileId: self.id, substance: a });
    for (const m of d.medicines) await saveMedication(actor, { profileId: self.id, name: m, nameConfirmed: true, originalText: m });
    for (const f of d.family) await createProfile(actor, familyId, { displayName: f.name, relationship: f.relationship, dateOfBirth: f.dateOfBirth || null });
    if (d.emergency?.name && d.emergency.phone) await addEmergencyContact(actor, self.id, d.emergency);
    await db.query(
      `insert into user_preferences(user_id, location_permission, latitude, longitude, location_label, camera_permission, notifications)
       values ($1,$2,$3,$4,$5,$6, jsonb_build_object('medication',true,'appointments',true,'daily_check_in',$7::boolean,'doctor_responses',true,'reports',true,'goals',true,'email',true,'push',$7::boolean))
       on conflict (user_id) do update set location_permission = excluded.location_permission, latitude = excluded.latitude, longitude = excluded.longitude,
         location_label = excluded.location_label, camera_permission = excluded.camera_permission, notifications = excluded.notifications, updated_at = now()`,
      [user.id, d.permissions.location, d.permissions.latitude ?? null, d.permissions.longitude ?? null, d.permissions.location === "granted" ? "Your location" : null, d.permissions.camera ? "granted" : "not_asked", d.permissions.notifications],
    );
    for (const [type, granted] of [["ai_processing", true], ["location", d.permissions.location === "granted"], ["notifications", d.permissions.notifications]] as const) {
      await db.query("insert into consents(user_id, consent_type, granted) values ($1,$2,$3)", [user.id, type, granted]);
    }
    await db.query("update users set onboarding_completed_at = now() where id = $1", [user.id]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
  redirect("/app");
}
