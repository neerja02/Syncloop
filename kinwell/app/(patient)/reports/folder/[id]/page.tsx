import { notFound } from "next/navigation";
import { requirePatient } from "@/lib/security/session";
import { familyProfiles } from "@/lib/server/selected-profile";
import { getFolder, listFolders, listReports } from "@/lib/services/reports";
import { ForbiddenError, NotFoundError } from "@/lib/security/access";
import { ReportsBrowser, type BrowserFilters } from "@/features/reports/components/reports-browser";
import { FolderMenu } from "@/features/reports/components/report-actions";

export const metadata = { title: "Report folder" };

export default async function FolderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<BrowserFilters> }) {
  const { id } = await params;
  const f = await searchParams;
  const actor = await requirePatient();
  let folder;
  try {
    folder = await getFolder(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  const [folders, reports, profiles] = await Promise.all([listFolders(actor, actor.familyId), listReports(actor, actor.familyId, { folderId: id, profileId: f.profile, q: f.q, type: f.type, status: f.status }), familyProfiles(actor.familyId)]);
  return <ReportsBrowser userId={actor.id} basePath={`/reports/folder/${id}`} title={folder.name} folders={folders} activeFolderId={id} reports={reports} profiles={profiles} filters={f} actions={<FolderMenu id={folder.id} name={folder.name} isDefault={folder.is_default} />} />;
}
