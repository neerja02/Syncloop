import { ShieldCheck } from "lucide-react";
import { requirePatient } from "@/lib/security/session";
import { getDb } from "@/lib/database/client";
import { formatDateTime } from "@/lib/utils/format";
import { Card } from "@/components/ui/misc";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageContainer } from "@/components/ui/page";
import { PrivacyControls } from "@/features/settings/components/settings-forms";

export const metadata = { title: "Privacy" };

export default async function PrivacySettings() {
  const actor = await requirePatient();
  const db = await getDb();
  const consents = (await db.query<{ consent_type: string; granted: boolean }>("select distinct on (consent_type) consent_type, granted from consents where user_id = $1 order by consent_type, granted_at desc", [actor.id])).rows;
  const access = (await db.query<{ action: string; entity_type: string; created_at: Date; full_name: string | null; role: string | null }>(
    `select l.action, l.entity_type, l.created_at, u.full_name, u.role from access_audit_logs l left join users u on u.id = l.user_id
     where l.family_id = $1 and l.action in ('view','upload','delete','export','create','access_denied','review_respond','review_approve','file_download') order by l.created_at desc limit 15`,
    [actor.familyId],
  )).rows;
  return (
    <PageContainer>
      <Link href="/profile" className="mb-3 inline-flex items-center gap-1 text-[15px] text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Profile
      </Link>
      <h1 className="text-[22px] font-semibold tracking-tight">Privacy &amp; data</h1>
      <p className="mb-5 mt-1 text-[15px] text-muted">Control consent, see who accessed your family&apos;s information, export or delete data.</p>
      <div className="space-y-4">
      <Card className="flex gap-3 p-5">
        <ShieldCheck className="h-6 w-6 shrink-0 text-primary-ink" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">How your data is protected</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            <li>Only members of your family can access your family&apos;s records.</li>
            <li>Files are stored privately and opened through short-lived links that are checked against your permissions.</li>
            <li>Nothing from chat is saved to a medical record without your confirmation.</li>
            <li>The AI receives only what&apos;s needed to answer each question.</li>
          </ul>
        </div>
      </Card>
      <PrivacyControls consents={Object.fromEntries(consents.map((c) => [c.consent_type, c.granted]))} />
      <Card className="p-5">
        <h3 className="font-semibold">Recent access to your family&apos;s records</h3>
        <ul className="mt-3 divide-y divide-line text-sm">
          {access.length === 0 && <li className="py-2 text-muted">No access recorded yet.</li>}
          {access.map((a, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{a.full_name ?? "System"}</span>
 · {a.action.replace(/_/g, " ")} {a.entity_type.replace(/_/g, " ")}
              </span>
              <span className="text-muted">{formatDateTime(a.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
      </div>
    </PageContainer>
  );
}
