import { requireAdmin } from "@/lib/security/session";
import { getDb } from "@/lib/database/client";
import { loadClinicalRules } from "@/lib/clinical/rules-repo";
import { formatDateTime } from "@/lib/utils/format";
import { Card, PageHeader, SectionTitle } from "@/components/ui/misc";
import { RulesTable } from "@/features/clinical/rules-table";

export const metadata = { title: "Admin" };

/** Admins manage configuration and audit. They are intentionally NOT given access to patient health data. */
export default async function AdminPage() {
  await requireAdmin();
  const db = await getDb();
  const counts = (await db.query<{ users: number; families: number; doctors: number; answers: number; reviews: number }>(
    "select (select count(*) from users) as users, (select count(*) from families) as families, (select count(*) from doctors) as doctors, (select count(*) from agent_audit_logs) as answers, (select count(*) from doctor_reviews) as reviews",
  )).rows[0]!;
  const audit = (await db.query<{ action: string; entity_type: string; created_at: Date; email: string | null }>("select l.action, l.entity_type, l.created_at, u.email from access_audit_logs l left join users u on u.id = l.user_id order by l.created_at desc limit 25")).rows;
  const agents = (await db.query<{ agent: string; urgency: string | null; n: number }>("select agent, urgency, count(*) as n from agent_audit_logs group by 1,2 order by n desc")).rows;
  const rules = await loadClinicalRules(true);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Platform administration" description="Clinical configuration and audit. Administrators do not have access to patient health records." />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Object.entries(counts).map(([k, v]) => (
          <li key={k}>
            <Card className="p-4">
              <p className="tabular text-2xl font-semibold">{v}</p>
              <p className="text-[13px] capitalize text-muted">{k === "answers" ? "AI answers" : k}</p>
            </Card>
          </li>
        ))}
      </ul>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>AI answers by agent</SectionTitle>
          <Card className="divide-y divide-line text-sm">
            {agents.map((a) => (
              <div key={a.agent + a.urgency} className="flex justify-between px-4 py-2.5">
                <span>
                  {a.agent} <span className="text-muted">· {a.urgency}</span>
                </span>
                <span className="tabular">{a.n}</span>
              </div>
            ))}
          </Card>
        </section>
        <section>
          <SectionTitle>Security audit log</SectionTitle>
          <Card className="divide-y divide-line text-sm">
            {audit.map((a, i) => (
              <div key={i} className="flex justify-between gap-2 px-4 py-2.5">
                <span>
                  {a.email ?? "system"} · {a.action.replace(/_/g, " ")} {a.entity_type}
                </span>
                <span className="shrink-0 text-muted">{formatDateTime(a.created_at)}</span>
              </div>
            ))}
          </Card>
        </section>
      </div>
      <div className="mt-8">
        <SectionTitle>Clinical rules</SectionTitle>
        <RulesTable rules={rules} editable />
      </div>
    </div>
  );
}
