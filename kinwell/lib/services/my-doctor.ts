import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/database/client";
import { assertFamilyAccess } from "@/lib/security/access";
import type { Actor } from "@/types/domain";

/** Patient-maintained contact card for the family's regular doctor. Never a doctor account. */
export interface MyDoctor {
  id: string;
  family_id: string;
  name: string;
  photo_path: string | null;
  specialisation: string | null;
  clinic_name: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  consultation_hours: string | null;
  emergency_phone: string | null;
  notes: string | null;
  last_visit_date: string | null;
  next_follow_up: string | null;
  updated_at: Date;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const phone = z
  .string()
  .trim()
  .max(24)
  .regex(/^[+\d][\d\s()-]{4,}$/, "Enter a valid phone number")
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export const myDoctorSchema = z.object({
  name: z.string().trim().min(2, "Enter the doctor's name").max(80),
  specialisation: optionalText(80),
  clinic_name: optionalText(120),
  phone,
  alt_phone: phone,
  email: z.string().trim().email("Enter a valid email").max(120).optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  pincode: z.string().trim().regex(/^[A-Za-z0-9 -]{3,10}$/, "Enter a valid pincode").optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  consultation_hours: optionalText(160),
  emergency_phone: phone,
  notes: optionalText(1000),
  last_visit_date: date,
  next_follow_up: date,
});
export type MyDoctorInput = z.input<typeof myDoctorSchema>;

const COLS = ["name", "specialisation", "clinic_name", "phone", "alt_phone", "email", "address", "city", "state", "pincode", "consultation_hours", "emergency_phone", "notes", "last_visit_date", "next_follow_up"] as const;

export async function getMyDoctor(actor: Actor, familyId: string): Promise<MyDoctor | null> {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  return (
    (
      await db.query<MyDoctor>(
        `select id, family_id, name, photo_path, specialisation, clinic_name, phone, alt_phone, email, address, city, state, pincode, consultation_hours,
                emergency_phone, notes, to_char(last_visit_date, 'YYYY-MM-DD') as last_visit_date, to_char(next_follow_up, 'YYYY-MM-DD') as next_follow_up, updated_at
         from my_doctors where family_id = $1`,
        [familyId],
      )
    ).rows[0] ?? null
  );
}

export async function saveMyDoctor(actor: Actor, familyId: string, input: unknown): Promise<MyDoctor> {
  await assertFamilyAccess(actor, familyId, "write");
  const d = myDoctorSchema.parse(input);
  const db = await getDb();
  const values = COLS.map((c) => d[c]);
  await db.query(
    `insert into my_doctors(family_id, created_by, ${COLS.join(", ")})
     values ($1, $2, ${COLS.map((_, i) => `$${i + 3}`).join(", ")})
     on conflict (family_id) do update set ${COLS.map((c) => `${c} = excluded.${c}`).join(", ")}, updated_at = now()`,
    [familyId, actor.id, ...values],
  );
  return (await getMyDoctor(actor, familyId))!;
}

export async function setMyDoctorPhoto(actor: Actor, familyId: string, path: string | null) {
  await assertFamilyAccess(actor, familyId, "write");
  const db = await getDb();
  await db.query("update my_doctors set photo_path = $2, updated_at = now() where family_id = $1", [familyId, path]);
}

export async function deleteMyDoctor(actor: Actor, familyId: string) {
  await assertFamilyAccess(actor, familyId, "write");
  const db = await getDb();
  await db.query("delete from my_doctors where family_id = $1", [familyId]);
}

/** Formats an address for display and map links. */
export function doctorAddressLine(d: Pick<MyDoctor, "clinic_name" | "address" | "city" | "state" | "pincode">) {
  return [d.address, d.city, d.state, d.pincode].filter(Boolean).join(", ");
}

/** Patient's remembered city for doctor discovery (valid for 90 days). */
export async function getSavedCity(userId: string): Promise<string | null> {
  const db = await getDb();
  const row = (await db.query<{ city: string | null; city_updated_at: Date | null }>("select city, city_updated_at from user_preferences where user_id = $1", [userId])).rows[0];
  if (!row?.city || !row.city_updated_at) return null;
  return Date.now() - new Date(row.city_updated_at).getTime() < 90 * 86400000 ? row.city : null;
}

export async function saveCity(userId: string, city: string) {
  const clean = city.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!clean) return;
  const db = await getDb();
  await db.query(
    `insert into user_preferences(user_id, city, city_updated_at) values ($1, $2, now())
     on conflict (user_id) do update set city = excluded.city, city_updated_at = now(), updated_at = now()`,
    [userId, clean],
  );
}
