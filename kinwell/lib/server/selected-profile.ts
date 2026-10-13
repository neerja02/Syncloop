import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getDb } from "@/lib/database/client";
import type { Actor, Profile } from "@/types/domain";

export const familyProfiles = cache(async (familyId: string) => {
  const db = await getDb();
  return (
    await db.query<Profile>(
      `select * from profiles where family_id = $1
       order by case relationship when 'self' then 0 when 'spouse' then 1 when 'mother' then 2 when 'father' then 3 else 4 end, created_at`,
      [familyId],
    )
  ).rows;
});

/** Resolves which profile a page shows: ?profile= param, then the remembered cookie, then "Myself". */
export async function resolveProfile(actor: Actor & { familyId: string }, requested?: string | null): Promise<{ profile: Profile; profiles: Profile[] }> {
  const profiles = await familyProfiles(actor.familyId);
  const cookieId = (await cookies()).get("kw_profile")?.value;
  const profile = profiles.find((p) => p.id === requested) ?? profiles.find((p) => p.id === cookieId) ?? profiles.find((p) => p.relationship === "self" && p.user_id === actor.id) ?? profiles[0]!;
  return { profile, profiles };
}
