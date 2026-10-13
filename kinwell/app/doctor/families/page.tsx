import Link from "next/link";
import { Users } from "lucide-react";
import { requireDoctor } from "@/lib/security/session";
import { listDoctorFamilies } from "@/lib/services/doctor";
import { formatDate } from "@/lib/utils/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Families" };

export default async function DoctorFamilies() {
  const actor = await requireDoctor();
  const families = await listDoctorFamilies(actor);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Assigned families" description="You can only see families that have assigned you as their doctor." />
      {families.length === 0 ? (
        <EmptyState icon={Users} title="No families assigned yet" description="Families choose you from the doctor directory in their app." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-[12.5px] text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Family</th>
                <th className="px-4 py-2.5 font-medium">Members</th>
                <th className="px-4 py-2.5 font-medium">Open reviews</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Unread</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {families.map((f) => (
                <tr key={f.id} className="hover:bg-subtle">
                  <td className="px-4 py-3">
                    <Link href={`/doctor/families/${f.id}`} className="font-medium text-primary-dark hover:underline">
                      {f.name}
                    </Link>
                    <span className="block text-[12px] text-muted">Since {formatDate(f.assigned_at)}</span>
                  </td>
                  <td className="tabular px-4 py-3">{f.member_count}</td>
                  <td className="px-4 py-3">{f.pending_reviews > 0 ? <Badge tone="warning">{f.pending_reviews} pending</Badge> : <span className="text-muted">—</span>}</td>
                  <td className="tabular hidden px-4 py-3 sm:table-cell">{f.unread_messages || "—"}</td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">{formatDate(f.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
