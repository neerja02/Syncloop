import "server-only";
import { getDb } from "@/lib/database/client";
import { assertFamilyAccess, logAccess } from "@/lib/security/access";
import { getStorage } from "@/lib/integrations/storage";
import type { Actor } from "@/types/domain";

/** Exports everything stored for the actor's family as JSON (files listed by name; download individually). */
export async function exportFamilyData(actor: Actor) {
  if (!actor.familyId) throw new Error("No family data to export.");
  await assertFamilyAccess(actor, actor.familyId);
  const db = await getDb();
  const fam = actor.familyId;
  const q = async (sql: string) => (await db.query(sql, [fam])).rows;
  const profileScoped = (t: string) => q(`select t.* from ${t} t join profiles p on p.id = t.profile_id where p.family_id = $1`);
  const data = {
    exportedAt: new Date().toISOString(),
    format: "kinwell-export-v1",
    family: (await q("select id, name, country_code, created_at from families where id = $1"))[0],
    profiles: await q("select * from profiles where family_id = $1"),
    conditions: await profileScoped("health_conditions"),
    allergies: await profileScoped("allergies"),
    medications: await profileScoped("medications"),
    measurements: await profileScoped("measurements"),
    symptoms: await profileScoped("symptoms"),
    goals: await profileScoped("health_goals"),
    checkIns: await profileScoped("check_ins"),
    emergencyContacts: await profileScoped("emergency_contacts"),
    doctorInstructions: await profileScoped("doctor_patient_instructions"),
    doctorNotes: await profileScoped("doctor_notes"),
    reports: await q("select id, profile_id, title, document_type, report_date, status, summary, doctor_notes, created_at from reports where family_id = $1"),
    reportResults: await q("select rr.* from report_results rr join reports r on r.id = rr.report_id where r.family_id = $1"),
    reportFiles: await q("select f.report_id, f.original_filename, f.mime_type, f.size_bytes, f.variant from report_files f join reports r on r.id = f.report_id where r.family_id = $1"),
    appointments: await q("select * from appointments where family_id = $1"),
    conversations: await q("select id, title, active_profile_id, created_at from conversations where family_id = $1"),
    messages: await q("select m.conversation_id, m.role, m.content, m.created_at from messages m join conversations c on c.id = m.conversation_id where c.family_id = $1 order by m.created_at"),
    doctorReviews: await q("select * from doctor_reviews where family_id = $1"),
  };
  await logAccess(actor, "export", "family", fam, fam);
  return data;
}

/**
 * Deletes the user's account. If they're the only admin of their family, the family and ALL its health data
 * (rows cascade) and stored files are deleted as well.
 */
export async function deleteAccount(actor: Actor) {
  const db = await getDb();
  for (const fam of actor.familyIds) {
    const admins = (await db.query<{ n: number }>("select count(*) as n from family_memberships where family_id = $1 and role = 'FAMILY_ADMIN' and user_id <> $2", [fam, actor.id])).rows[0]!.n;
    if (admins === 0) {
      const files = await db.query<{ storage_key: string }>("select f.storage_key from report_files f join reports r on r.id = f.report_id where r.family_id = $1", [fam]);
      for (const f of files.rows) await getStorage().delete(f.storage_key).catch(() => {});
      const photos = await db.query<{ photo_url: string }>("select photo_url from profiles where family_id = $1 and photo_url is not null", [fam]);
      for (const p of photos.rows) await getStorage().delete(p.photo_url).catch(() => {});
      await db.query("delete from families where id = $1", [fam]);
    }
  }
  await logAccess(actor, "delete_account", "user", actor.id, null);
  await db.query("delete from users where id = $1", [actor.id]);
}
