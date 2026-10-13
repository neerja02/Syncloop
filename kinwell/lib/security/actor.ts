import "server-only";
import { getDb } from "@/lib/database/client";
import type { Actor, SessionUser, UserRole } from "@/types/domain";

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  email_verified_at: Date | null;
  onboarding_completed_at: Date | null;
  country_code: string;
  is_demo: boolean;
}

export function toSessionUser(u: UserRow): SessionUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role,
    emailVerified: !!u.email_verified_at,
    onboardingCompleted: !!u.onboarding_completed_at,
    countryCode: u.country_code,
    isDemo: u.is_demo,
  };
}

export async function loadActor(user: SessionUser, preferredFamilyId?: string | null): Promise<Actor> {
  const db = await getDb();
  const memberships = (
    await db.query<{ family_id: string; role: "FAMILY_ADMIN" | "MEMBER" }>(
      "select family_id, role from family_memberships where user_id = $1 order by created_at",
      [user.id],
    )
  ).rows;
  const doctor = (await db.query<{ id: string }>("select id from doctors where user_id = $1", [user.id])).rows[0];
  const chosen = memberships.find((m) => m.family_id === preferredFamilyId) ?? memberships[0] ?? null;
  return {
    ...user,
    familyIds: memberships.map((m) => m.family_id),
    familyId: chosen?.family_id ?? null,
    familyRole: chosen?.role ?? null,
    doctorId: doctor?.id ?? null,
  };
}
