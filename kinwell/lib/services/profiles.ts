import "server-only";
import { getDb } from "@/lib/database/client";
import { assertFamilyAccess, assertFamilyAdmin, assertProfileAccess, logAccess } from "@/lib/security/access";
import { getStorage } from "@/lib/integrations/storage";
import { profileInputSchema, type ProfileInput } from "@/lib/validation/health";
import type { Actor, Profile } from "@/types/domain";

const AVATAR_COLORS = ["#3D83DF", "#28328C", "#B45309", "#7C3AED", "#BE185D", "#2563EB", "#15803D", "#9A3412"];

export async function listProfiles(actor: Actor, familyId: string): Promise<Profile[]> {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  const { rows } = await db.query<Profile>(
    `select * from profiles where family_id = $1
     order by case relationship when 'self' then 0 when 'spouse' then 1 when 'mother' then 2 when 'father' then 3 else 4 end, created_at`,
    [familyId],
  );
  return rows;
}

export async function getProfile(actor: Actor, profileId: string): Promise<Profile> {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  const { rows } = await db.query<Profile>("select * from profiles where id = $1", [profileId]);
  return rows[0]!;
}

function toColumns(input: ProfileInput) {
  return {
    display_name: input.displayName,
    relationship: input.relationship,
    date_of_birth: input.dateOfBirth,
    sex: input.sex ?? null,
    height_cm: input.heightCm ?? null,
    weight_kg: input.weightKg ?? null,
    blood_group: input.bloodGroup ?? null,
    pregnancy_status: input.pregnancyStatus ?? null,
    family_history: input.familyHistory,
    previous_surgeries: input.previousSurgeries,
    lifestyle: JSON.stringify(input.lifestyle ?? {}),
    insurance: input.insuranceProvider || input.insurancePolicy ? JSON.stringify({ provider: input.insuranceProvider, policy: input.insurancePolicy }) : null,
    species: input.relationship === "pet" ? input.species ?? "other" : null,
    breed: input.relationship === "pet" ? input.breed ?? null : null,
    neutered: input.relationship === "pet" ? input.neutered ?? null : null,
  };
}

export async function createProfile(actor: Actor, familyId: string, raw: unknown, opts: { userId?: string | null } = {}): Promise<Profile> {
  await assertFamilyAccess(actor, familyId, "write");
  const input = profileInputSchema.parse(raw);
  const db = await getDb();
  if (input.relationship === "self") {
    const existing = await db.query("select 1 from profiles where family_id = $1 and relationship = 'self' and user_id = $2", [familyId, actor.id]);
    if (existing.rows.length) throw new Error("You already have a 'Myself' profile.");
  }
  const count = (await db.query<{ n: number }>("select count(*) as n from profiles where family_id = $1", [familyId])).rows[0]!.n;
  const c = toColumns(input);
  const { rows } = await db.query<Profile>(
    `insert into profiles(family_id, user_id, display_name, relationship, date_of_birth, sex, height_cm, weight_kg, blood_group, pregnancy_status,
      family_history, previous_surgeries, lifestyle, insurance, avatar_color, species, breed, neutered)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18) returning *`,
    [familyId, opts.userId ?? null, c.display_name, c.relationship, c.date_of_birth, c.sex, c.height_cm, c.weight_kg, c.blood_group, c.pregnancy_status, c.family_history, c.previous_surgeries, c.lifestyle, c.insurance, input.avatarColor ?? AVATAR_COLORS[count % AVATAR_COLORS.length], c.species, c.breed, c.neutered],
  );
  await logAccess(actor, "create", "profile", rows[0]!.id, familyId);
  return rows[0]!;
}

export async function updateProfile(actor: Actor, profileId: string, raw: unknown): Promise<Profile> {
  const ref = await assertProfileAccess(actor, profileId, "write");
  const input = profileInputSchema.parse(raw);
  const c = toColumns(input);
  const db = await getDb();
  const { rows } = await db.query<Profile>(
    `update profiles set display_name=$2, relationship=$3, date_of_birth=$4, sex=$5, height_cm=$6, weight_kg=$7, blood_group=$8, pregnancy_status=$9,
      family_history=$10, previous_surgeries=$11, lifestyle=$12::jsonb, insurance=$13::jsonb, species=$14, breed=$15, neutered=$16, updated_at=now() where id=$1 returning *`,
    [profileId, c.display_name, c.relationship, c.date_of_birth, c.sex, c.height_cm, c.weight_kg, c.blood_group, c.pregnancy_status, c.family_history, c.previous_surgeries, c.lifestyle, c.insurance, c.species, c.breed, c.neutered],
  );
  await logAccess(actor, "update", "profile", profileId, ref.family_id);
  return rows[0]!;
}

/**
 * Deletes a profile and ALL of its health data. Database rows cascade; stored files are removed from storage
 * first so no orphaned documents remain accessible.
 */
export async function deleteProfile(actor: Actor, profileId: string) {
  const ref = await assertProfileAccess(actor, profileId, "write");
  assertFamilyAdmin(actor, ref.family_id);
  const db = await getDb();
  const files = await db.query<{ storage_key: string }>(
    "select f.storage_key from report_files f join reports r on r.id = f.report_id where r.profile_id = $1",
    [profileId],
  );
  const storage = getStorage();
  for (const f of files.rows) await storage.delete(f.storage_key).catch(() => {});
  await db.transaction(async (tx) => {
    // Notifications referencing the profile cascade; audit rows referencing it cascade too.
    await tx.query("delete from profiles where id = $1", [profileId]);
  });
  await logAccess(actor, "delete", "profile", profileId, ref.family_id, { files: files.rows.length });
}

export async function getEmergencyContacts(actor: Actor, profileId: string) {
  await assertProfileAccess(actor, profileId);
  const db = await getDb();
  return (await db.query<{ id: string; name: string; relationship: string | null; phone: string; is_primary: boolean }>("select * from emergency_contacts where profile_id = $1 order by is_primary desc, created_at", [profileId])).rows;
}

export async function addEmergencyContact(actor: Actor, profileId: string, c: { name: string; relationship?: string | null; phone: string }) {
  await assertProfileAccess(actor, profileId, "write");
  if (!c.name.trim() || !/^[+\d][\d\s-]{5,19}$/.test(c.phone.trim())) throw new Error("Enter a name and a valid phone number.");
  const db = await getDb();
  await db.query("insert into emergency_contacts(profile_id, name, relationship, phone) values ($1,$2,$3,$4)", [profileId, c.name.trim(), c.relationship ?? null, c.phone.trim()]);
}

export async function removeEmergencyContact(actor: Actor, contactId: string) {
  const db = await getDb();
  const row = (await db.query<{ profile_id: string }>("select profile_id from emergency_contacts where id = $1", [contactId])).rows[0];
  if (!row) return;
  await assertProfileAccess(actor, row.profile_id, "write");
  await db.query("delete from emergency_contacts where id = $1", [contactId]);
}
