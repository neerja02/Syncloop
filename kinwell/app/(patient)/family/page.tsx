import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePatient } from "@/lib/security/session";
import { familyProfiles } from "@/lib/server/selected-profile";
import { getDb } from "@/lib/database/client";
import { ageFromDob } from "@/lib/utils/format";
import { RELATIONSHIP_LABELS, SPECIES_LABELS } from "@/types/domain";
import { PageContainer } from "@/components/ui/page";
import { ProfileAvatar } from "@/features/shell/profile-avatar";
import { AddProfileButton, AutoOpenAddProfile } from "@/features/family/components/family-buttons";

export const metadata = { title: "Family" };

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const actor = await requirePatient();
  const { new: newRel } = await searchParams;
  const profiles = await familyProfiles(actor.familyId);
  const db = await getDb();
  const stats = (await db.query<{ profile_id: string; conditions: string[]; reports: number }>(
    `select p.id as profile_id,
      coalesce((select array_agg(c.name order by c.created_at) from health_conditions c where c.profile_id = p.id and c.status <> 'resolved'), '{}') as conditions,
      (select count(*) from reports r where r.profile_id = p.id) as reports
     from profiles p where p.family_id = $1`,
    [actor.familyId],
  )).rows;
  return (
    <PageContainer>
      {newRel && <AutoOpenAddProfile relationship={newRel} />}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Family</h1>
          <p className="mt-0.5 text-[15px] text-muted">Each person has their own private health record.</p>
        </div>
        <AddProfileButton />
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {profiles.map((p) => {
          const s = stats.find((x) => x.profile_id === p.id);
          const age = ageFromDob(p.date_of_birth);
          const sub = p.relationship === "pet" ? [SPECIES_LABELS[p.species ?? "other"], p.breed, age != null ? `${age} yrs` : null].filter(Boolean).join(" · ") : [p.relationship === "self" ? "You" : RELATIONSHIP_LABELS[p.relationship], age != null ? `${age} yrs` : null].filter(Boolean).join(" · ");
          const detail = [s?.conditions.slice(0, 2).join(", "), s?.reports ? `${s.reports} report${s.reports === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
          return (
            <li key={p.id}>
              <Link href={`/family/${p.id}`} className="flex min-h-[72px] items-center gap-3.5 px-4 py-3 hover:bg-subtle">
                <ProfileAvatar profile={p} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{p.display_name}</span>
                  <span className="block truncate text-[14px] text-muted">{sub}</span>
                  {detail && <span className="block truncate text-[13px] text-muted">{detail}</span>}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
