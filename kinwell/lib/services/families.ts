import "server-only";
import { getDb } from "@/lib/database/client";
import { assertFamilyAccess, logAccess } from "@/lib/security/access";
import type { Actor, Doctor } from "@/types/domain";

export const DEFAULT_REPORT_FOLDERS = [
  { name: "Blood Tests", icon: "droplet" },
  { name: "Prescriptions", icon: "pill" },
  { name: "Imaging", icon: "scan" },
  { name: "General Reports", icon: "file-text" },
];

export async function createFamily(userId: string, name: string, countryCode = "IN") {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const fam = (await tx.query<{ id: string }>("insert into families(name, created_by, country_code) values ($1,$2,$3) returning id", [name, userId, countryCode])).rows[0]!;
    await tx.query("insert into family_memberships(family_id, user_id, role) values ($1,$2,'FAMILY_ADMIN')", [fam.id, userId]);
    for (const f of DEFAULT_REPORT_FOLDERS) {
      await tx.query("insert into report_folders(family_id, name, icon, is_default, created_by) values ($1,$2,$3,true,$4)", [fam.id, f.name, f.icon, userId]);
    }
    return fam.id;
  });
}

export async function getFamily(actor: Actor, familyId: string) {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  return (await db.query<{ id: string; name: string; country_code: string; is_demo: boolean; created_at: Date }>("select * from families where id = $1", [familyId])).rows[0]!;
}

export async function getAssignedDoctor(actor: Actor, familyId: string): Promise<(Doctor & { assigned_at: Date }) | null> {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  const { rows } = await db.query<Doctor & { assigned_at: Date }>(
    `select d.*, a.assigned_at from doctor_family_assignments a join doctors d on d.id = a.doctor_id where a.family_id = $1 and a.status = 'active'`,
    [familyId],
  );
  return rows[0] ?? null;
}

export async function listDoctorsDirectory() {
  const db = await getDb();
  return (await db.query<Doctor>("select * from doctors order by full_name")).rows;
}

/** Family admin chooses (or changes) the dedicated family doctor. */
export async function assignDoctor(actor: Actor, familyId: string, doctorId: string) {
  await assertFamilyAccess(actor, familyId, "write");
  if (actor.familyRole !== "FAMILY_ADMIN") throw new Error("Only the family admin can change the family doctor.");
  const db = await getDb();
  const doc = (await db.query<{ id: string; accepting_reviews: boolean }>("select id, accepting_reviews from doctors where id = $1", [doctorId])).rows[0];
  if (!doc) throw new Error("Doctor not found");
  await db.transaction(async (tx) => {
    await tx.query("update doctor_family_assignments set status = 'ended', ended_at = now() where family_id = $1 and status = 'active'", [familyId]);
    await tx.query("insert into doctor_family_assignments(doctor_id, family_id) values ($1,$2)", [doctorId, familyId]);
  });
  await logAccess(actor, "assign_doctor", "family", familyId, familyId, { doctorId });
}

export async function endDoctorAssignment(actor: Actor, familyId: string) {
  await assertFamilyAccess(actor, familyId, "write");
  if (actor.familyRole !== "FAMILY_ADMIN") throw new Error("Only the family admin can change the family doctor.");
  const db = await getDb();
  await db.query("update doctor_family_assignments set status = 'ended', ended_at = now() where family_id = $1 and status = 'active'", [familyId]);
  await logAccess(actor, "end_doctor_assignment", "family", familyId, familyId);
}

export async function familyMemberUsers(familyId: string) {
  const db = await getDb();
  return (await db.query<{ id: string; email: string; full_name: string }>("select u.id, u.email, u.full_name from family_memberships m join users u on u.id = m.user_id where m.family_id = $1", [familyId])).rows;
}
