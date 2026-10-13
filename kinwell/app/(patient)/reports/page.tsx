import { requirePatient } from "@/lib/security/session";
import { familyProfiles } from "@/lib/server/selected-profile";
import { listFolders, listReports } from "@/lib/services/reports";
import { ReportsBrowser, type BrowserFilters } from "@/features/reports/components/reports-browser";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<BrowserFilters> }) {
  const f = await searchParams;
  const actor = await requirePatient();
  const [folders, reports, profiles] = await Promise.all([listFolders(actor, actor.familyId), listReports(actor, actor.familyId, { profileId: f.profile, q: f.q, type: f.type, status: f.status }), familyProfiles(actor.familyId)]);
  return <ReportsBrowser userId={actor.id} basePath="/reports" title="Reports" folders={folders} reports={reports} profiles={profiles} filters={f} />;
}
