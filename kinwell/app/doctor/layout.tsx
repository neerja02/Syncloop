import { requireDoctor } from "@/lib/security/session";
import { getDb } from "@/lib/database/client";
import { DoctorNav } from "@/features/doctor/components/doctor-nav";

export const dynamic = "force-dynamic";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireDoctor();
  const db = await getDb();
  const doc = (await db.query<{ full_name: string; speciality: string }>("select full_name, speciality from doctors where id = $1", [actor.doctorId])).rows[0]!;
  const counts = (await db.query<{ reviews: number; messages: number }>(
    `select (select count(*) from doctor_reviews r join doctor_family_assignments a on a.family_id = r.family_id and a.doctor_id = r.doctor_id and a.status = 'active' where r.doctor_id = $1 and r.status in ('pending','in_review')) as reviews,
            (select count(*) from doctor_messages m join doctor_family_assignments a on a.family_id = m.family_id and a.doctor_id = m.doctor_id and a.status = 'active' where m.doctor_id = $1 and m.sender_role = 'family' and m.read_at is null) as messages`,
    [actor.doctorId],
  )).rows[0]!;
  return (
    <div className="lg:flex">
      <DoctorNav name={doc.full_name} speciality={doc.speciality} counts={counts} />
      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
