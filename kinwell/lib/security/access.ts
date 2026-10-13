import "server-only";
import { getDb, type Db } from "@/lib/database/client";
import type { Actor } from "@/types/domain";

/**
 * Server-side authorisation. Every service function that touches family or health data calls one of these
 * guards. Rules:
 *  - Family members (PATIENT / FAMILY_ADMIN) can read and write their own family's data.
 *  - A DOCTOR can read data only for families with an *active* assignment to them, and may only write
 *    clinical artefacts (instructions, notes, review responses, report reviews, appointment status).
 *  - ADMIN manages configuration (clinical rules, audit) but is not granted access to patient health data.
 */
export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "You don't have permission to access this information.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  status = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export type AccessMode = "read" | "write" | "clinical_write";

export async function isDoctorAssigned(db: Db, doctorId: string, familyId: string) {
  const { rows } = await db.query<{ ok: boolean }>(
    "select exists(select 1 from doctor_family_assignments where doctor_id = $1 and family_id = $2 and status = 'active') as ok",
    [doctorId, familyId],
  );
  return !!rows[0]?.ok;
}

export async function canAccessFamily(actor: Actor, familyId: string, mode: AccessMode = "read", db?: Db): Promise<boolean> {
  if (actor.familyIds.includes(familyId) && mode !== "clinical_write") return true;
  if (actor.role === "DOCTOR" && actor.doctorId) {
    if (mode === "write") return false;
    return isDoctorAssigned(db ?? (await getDb()), actor.doctorId, familyId);
  }
  return false;
}

export async function assertFamilyAccess(actor: Actor, familyId: string, mode: AccessMode = "read") {
  if (!(await canAccessFamily(actor, familyId, mode))) {
    await logAccess(actor, "access_denied", "family", familyId, familyId, { mode });
    throw new ForbiddenError();
  }
}

export interface ProfileRef {
  id: string;
  family_id: string;
  display_name: string;
}

/** Loads a profile and asserts the actor may access it. Throws NotFound for unknown ids and Forbidden otherwise. */
export async function assertProfileAccess(actor: Actor, profileId: string, mode: AccessMode = "read"): Promise<ProfileRef> {
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) throw new NotFoundError("Profile not found");
  const { rows } = await db.query<ProfileRef>("select id, family_id, display_name from profiles where id = $1", [profileId]);
  const profile = rows[0];
  if (!profile) throw new NotFoundError("Profile not found");
  if (!(await canAccessFamily(actor, profile.family_id, mode, db))) {
    await logAccess(actor, "access_denied", "profile", profileId, profile.family_id, { mode });
    throw new ForbiddenError();
  }
  return profile;
}

export function assertFamilyAdmin(actor: Actor, familyId: string) {
  if (!actor.familyIds.includes(familyId) || (actor.familyId === familyId && actor.familyRole !== "FAMILY_ADMIN")) {
    throw new ForbiddenError("Only the family admin can do this.");
  }
}

export function assertDoctor(actor: Actor): asserts actor is Actor & { doctorId: string } {
  if (actor.role !== "DOCTOR" || !actor.doctorId) throw new ForbiddenError("Doctor access required.");
}

export function assertAdmin(actor: Actor) {
  if (actor.role !== "ADMIN") throw new ForbiddenError("Administrator access required.");
}

export async function logAccess(
  actor: Pick<Actor, "id"> | null,
  action: string,
  entityType: string,
  entityId: string | null,
  familyId: string | null,
  metadata: Record<string, unknown> = {},
) {
  try {
    const db = await getDb();
    await db.query(
      "insert into access_audit_logs(user_id, action, entity_type, entity_id, family_id, metadata) values ($1,$2,$3,$4,$5,$6::jsonb)",
      [actor?.id ?? null, action, entityType, entityId, familyId, JSON.stringify(metadata)],
    );
  } catch {
    // audit logging must never break the user flow
  }
}
