import Link from "next/link";
import { BookOpen, Folder } from "lucide-react";
import { requireDoctor } from "@/lib/security/session";
import { KNOWLEDGE_CATEGORIES, listKnowledgeDocuments } from "@/lib/services/knowledge";
import { getEmbeddingProvider } from "@/lib/ai/providers";
import { formatDate } from "@/lib/utils/format";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/misc";
import { KnowledgeTestSearch, KnowledgeUpload } from "@/features/doctor/components/doctor-forms";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "Knowledge base" };

const STATUS_TONE = { approved: "success", ready_for_review: "warning", processing: "info", failed: "danger", archived: "neutral" } as const;

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ category?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  const actor = await requireDoctor();
  const docs = await listKnowledgeDocuments(actor, { category: sp.category, status: sp.status, q: sp.q });
  const all = await listKnowledgeDocuments(actor);
  const emb = getEmbeddingProvider();
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Your medical knowledge base" description="Upload books, protocols, medicine guides and self-care instructions. After you approve them, the assistant retrieves them first when answering your patients — before any general information." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        <nav aria-label="Knowledge folders">
          <ul className="space-y-0.5">
            <li>
              <Link href="/doctor/knowledge" className={cn("flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[14px] hover:bg-subtle", !sp.category && "bg-accent-light/60 font-medium text-primary-dark")}>
                <BookOpen className="h-4 w-4" aria-hidden /> All documents <span className="tabular ml-auto text-[12px] text-muted">{all.length}</span>
              </Link>
            </li>
            {KNOWLEDGE_CATEGORIES.map((c) => {
              const n = all.filter((d) => d.category === c).length;
              return (
                <li key={c}>
                  <Link href={`/doctor/knowledge?category=${encodeURIComponent(c)}`} className={cn("flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[14px] hover:bg-subtle", sp.category === c && "bg-accent-light/60 font-medium text-primary-dark")}>
                    <Folder className="h-4 w-4" aria-hidden /> {c} {n > 0 && <span className="tabular ml-auto text-[12px] text-muted">{n}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <section aria-labelledby="docs">
          <SectionTitle id="docs">{sp.category ?? "All documents"}</SectionTitle>
          <form className="mb-3" role="search">
            {sp.category && <input type="hidden" name="category" value={sp.category} />}
            <input name="q" defaultValue={sp.q} placeholder="Search titles and text" aria-label="Search documents" className="h-10 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus:border-primary focus:outline-none" />
          </form>
          {docs.length === 0 ? (
            <EmptyState icon={BookOpen} title="No documents yet" description="Upload your first protocol or guidance document." />
          ) : (
            <Card className="divide-y divide-line">
              {docs.map((d) => (
                <Link key={d.id} href={`/doctor/knowledge/${d.id}`} className="block p-4 hover:bg-subtle">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.title}</span>
                    {d.is_demo && <Badge tone="warning" icon={false}>Demo</Badge>}
                    <Badge tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? "neutral"} className="ml-auto">
                      {d.status === "approved" ? (d.active ? "Approved · active" : "Approved · inactive") : d.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-muted">
                    {d.category} · {d.document_type.toUpperCase()} · v{d.version} · {d.chunk_count} passages · uploaded {formatDate(d.uploaded_at)}
                    {d.reviewed_at ? ` · approved ${formatDate(d.reviewed_at)}` : ""}
                  </p>
                  {d.error && <p className="mt-1 text-[13px] text-danger">{d.error}</p>}
                </Link>
              ))}
            </Card>
          )}
        </section>
        <aside className="space-y-6">
          <Card className="p-5">
            <SectionTitle>Upload a document</SectionTitle>
            <KnowledgeUpload categories={KNOWLEDGE_CATEGORIES} defaultCategory={sp.category} />
          </Card>
          <Card className="p-5">
            <SectionTitle>Test retrieval</SectionTitle>
            <p className="mb-3 text-[13px] text-muted">See which approved passages the assistant would find for a patient question. Embeddings: {emb.name} ({emb.model}){emb.isMock ? " — development mode" : ""}.</p>
            <KnowledgeTestSearch />
          </Card>
        </aside>
      </div>
    </div>
  );
}
