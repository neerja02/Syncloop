import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDoctor } from "@/lib/security/session";
import { getDoctorFamily } from "@/lib/services/doctor";
import { ForbiddenError } from "@/lib/security/access";
import { ageFromDob, formatDate } from "@/lib/utils/format";
import { RELATIONSHIP_LABELS, type Relationship } from "@/types/domain";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";

export const metadata = { title: "Family" };

export default async function DoctorFamilyPage({ params }: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await params;
  const actor = await requireDoctor();
  let data;
  try {
    data = await getDoctorFamily(actor, familyId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader eyebrow={<Link href="/doctor/families">← Families</Link>} title={data.family.name} description="Patients in this family" actions={<LinkButton href={`/doctor/messages?family=${familyId}`} variant="secondary">Message family</LinkButton>} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.profiles.map((p) => (
          <li key={p.id}>
            <Link href={`/doctor/patients/${p.id}`} className="block h-full">
              <Card className="h-full p-4 hover:border-primary/30">
                <div className="flex items-center gap-3">
                  <Avatar name={p.display_name} color={p.avatar_color} size={44} />
                  <div>
                    <p className="font-semibold">{p.display_name}</p>
                    <p className="text-sm text-muted">
                      {RELATIONSHIP_LABELS[p.relationship as Relationship]} · {ageFromDob(p.date_of_birth) ?? "?"} yrs{p.sex ? ` · ${p.sex}` : ""}
                    </p>
                  </div>
                  {p.open_reviews > 0 && <Badge tone="warning" className="ml-auto">{p.open_reviews} review</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.conditions.map((c) => (
                    <Badge key={c} icon={false}>
                      {c}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-[13px] text-muted">
                  {p.active_meds} active medicines · last report {formatDate(p.last_report)}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
