import Link from "next/link";
import { FileImage, FileText, Folder, LayoutGrid, List, Search } from "lucide-react";
import { getStorage } from "@/lib/integrations/storage";
import { getDb } from "@/lib/database/client";
import type { ReportFolder, ReportRow } from "@/lib/services/reports";
import type { Profile } from "@/types/domain";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { EmptyState } from "@/components/ui/misc";
import { TakePhotoButton, UploadButton } from "@/features/reports/components/upload-button";
import { DOC_TYPE_LABEL, ReportStatusBadge } from "./report-status";
import { NewFolderButton } from "./report-actions";

export interface BrowserFilters {
  q?: string;
  profile?: string;
  type?: string;
  status?: string;
  view?: string;
}

async function thumbnails(userId: string, reports: ReportRow[]) {
  const ids = reports.filter((r) => r.has_thumbnail).map((r) => r.id);
  if (!ids.length) return {};
  const db = await getDb();
  const rows = (await db.query<{ report_id: string; storage_key: string }>("select report_id, storage_key from report_files where variant = 'thumbnail' and report_id = any($1::uuid[])", [ids])).rows;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.report_id] = await getStorage().signedUrl(r.storage_key, { userId, ttlSeconds: 600 });
  return out;
}

export async function ReportsBrowser({ userId, basePath, title, folders, activeFolderId, reports, profiles, filters, actions }: { userId: string; basePath: string; title: string; folders: ReportFolder[]; activeFolderId?: string; reports: ReportRow[]; profiles: Profile[]; filters: BrowserFilters; actions?: React.ReactNode }) {
  const thumbs = await thumbnails(userId, reports);
  const view = filters.view === "list" ? "list" : "grid";
  const href = (o: Partial<BrowserFilters>) => {
    const p = new URLSearchParams();
    const merged = { ...filters, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-[22px] font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <UploadButton profileId={filters.profile} folderId={activeFolderId} label="Upload" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <TakePhotoButton profileId={filters.profile} />
        <NewFolderButton />
        {actions}
      </div>
      <form action={basePath} className="relative mb-4" role="search">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input name="q" type="search" defaultValue={filters.q} placeholder="Search reports" aria-label="Search reports" className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-[16px] focus:border-primary focus:outline-none" />
        {filters.profile && <input type="hidden" name="profile" value={filters.profile} />}
        {filters.view && <input type="hidden" name="view" value={filters.view} />}
      </form>

      {/* Folders: chips on phones, a quiet list on wide screens. */}
      <nav aria-label="Folders" className="no-scrollbar -mx-4 mb-3 overflow-x-auto px-4 lg:hidden">
        <ul className="flex w-max gap-2">
          <li>
            <Link href="/reports" className={cn("flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px]", !activeFolderId && basePath === "/reports" ? "border-primary bg-accent-light font-medium text-primary-dark" : "border-line bg-surface")}>
              <FileText className="h-4 w-4" aria-hidden /> All
            </Link>
          </li>
          {folders.map((f) => (
            <li key={f.id}>
              <Link href={`/reports/folder/${f.id}`} className={cn("flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px]", activeFolderId === f.id ? "border-primary bg-accent-light font-medium text-primary-dark" : "border-line bg-surface")}>
                <Folder className="h-4 w-4" aria-hidden /> {f.name}
                <span className="tabular text-[12px] text-muted">{f.report_count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Folders" className="hidden lg:block">
          <ul className="space-y-0.5">
            <li>
              <Link href="/reports" className={cn("flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[14px] hover:bg-subtle", !activeFolderId && basePath === "/reports" && "bg-accent-light font-medium text-primary-dark")}>
                <FileText className="h-4 w-4" aria-hidden /> All reports
              </Link>
            </li>
            {folders.map((f) => (
              <li key={f.id}>
                <Link href={`/reports/folder/${f.id}`} className={cn("flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[14px] hover:bg-subtle", activeFolderId === f.id && "bg-accent-light font-medium text-primary-dark")}>
                  <Folder className="h-4 w-4" aria-hidden /> <span className="flex-1 truncate">{f.name}</span>
                  <span className="tabular text-[12px] text-muted">{f.report_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-2">
            <div className="no-scrollbar -mx-4 min-w-0 flex-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by person">
              <div className="flex w-max gap-1.5">
                <Link href={href({ profile: undefined })} className={cn("flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-[14px]", !filters.profile ? "border-primary bg-primary text-white" : "border-line bg-surface")}>
                  Everyone
                </Link>
                {profiles.map((p) => (
                  <Link key={p.id} href={href({ profile: p.id })} className={cn("flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-[14px]", filters.profile === p.id ? "border-primary bg-primary text-white" : "border-line bg-surface")}>
                    {p.relationship === "self" ? "Me" : p.display_name}
                  </Link>
                ))}
              </div>
            </div>
            <div className="hidden shrink-0 rounded-[10px] border border-line bg-surface p-0.5 sm:flex" role="group" aria-label="View">
              <Link href={href({ view: undefined })} aria-label="Grid view" aria-current={view === "grid" ? "true" : undefined} className={cn("rounded-[8px] p-1.5", view === "grid" ? "bg-subtle text-ink" : "text-muted")}>
                <LayoutGrid className="h-4 w-4" />
              </Link>
              <Link href={href({ view: "list" })} aria-label="List view" aria-current={view === "list" ? "true" : undefined} className={cn("rounded-[8px] p-1.5", view === "list" ? "bg-subtle text-ink" : "text-muted")}>
                <List className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {reports.length === 0 ? (
            <EmptyState icon={FileText} title={filters.q || filters.profile || filters.type || filters.status ? "No reports match these filters" : "You haven't uploaded any reports yet."} description="Upload a PDF or photo — Kinwell reads it carefully and never guesses unclear values." action={<UploadButton profileId={filters.profile} folderId={activeFolderId} variant="secondary" />} />
          ) : view === "grid" ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/reports/${r.id}`} className="group block h-full overflow-hidden rounded-[14px] border border-line bg-surface hover:border-primary/40 hover:shadow-[var(--shadow-soft)]">
                    <div className="flex aspect-[4/3] items-center justify-center bg-subtle">
                      {thumbs[r.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbs[r.id]} alt="" className="h-full w-full object-cover" />
                      ) : r.document_type === "imaging" ? (
                        <FileImage className="h-10 w-10 text-primary-ink/70" aria-hidden />
                      ) : (
                        <FileText className="h-10 w-10 text-primary-ink/70" aria-hidden />
                      )}
                    </div>
                    <div className="space-y-1.5 p-3">
                      <p className="line-clamp-2 text-[14px] font-medium leading-snug group-hover:text-primary-dark">{r.title}</p>
                      <p className="text-[12.5px] text-muted">
                        {r.profile_name} · {formatDate(r.report_date ?? r.created_at)}
                      </p>
                      <p className="text-[12px] text-muted">{DOC_TYPE_LABEL[r.document_type] ?? "Document"}</p>
                      <div className="flex flex-wrap gap-1">
                        {r.status !== "processed" && <ReportStatusBadge status={r.status} />}
                        
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-subtle text-left text-[12.5px] text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Person</th>
                    <th className="hidden px-4 py-2.5 font-medium md:table-cell">Type</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {reports.map((r) => (
                    <tr key={r.id} className="hover:bg-subtle">
                      <td className="px-4 py-2.5">
                        <Link href={`/reports/${r.id}`} className="font-medium hover:text-primary-dark">
                          {r.title}
                        </Link>
                        {r.folder_name && <span className="block text-[12px] text-muted">{r.folder_name}</span>}
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">{r.profile_name}</td>
                      <td className="hidden px-4 py-2.5 text-muted md:table-cell">{DOC_TYPE_LABEL[r.document_type] ?? "Document"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(r.report_date ?? r.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          <ReportStatusBadge status={r.status} />
                          
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
