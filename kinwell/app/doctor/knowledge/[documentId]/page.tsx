import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDoctor } from "@/lib/security/session";
import { getKnowledgeDocument, KNOWLEDGE_CATEGORIES } from "@/lib/services/knowledge";
import { ForbiddenError, NotFoundError } from "@/lib/security/access";
import { getStorage } from "@/lib/integrations/storage";
import { formatDateTime } from "@/lib/utils/format";
import { Badge, Card, SectionTitle } from "@/components/ui/misc";
import { KnowledgeStatusButtons, KnowledgeUpload } from "@/features/doctor/components/doctor-forms";

export const metadata = { title: "Knowledge document" };

export default async function KnowledgeDocPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const actor = await requireDoctor();
  let data;
  try {
    data = await getKnowledgeDocument(actor, documentId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) notFound();
    throw e;
  }
  const { doc, chunks } = data;
  const fileUrl = doc.original_file_url ? await getStorage().signedUrl(doc.original_file_url, { userId: actor.id, ttlSeconds: 600 }) : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/doctor/knowledge" className="text-[13px] text-muted hover:text-ink">
        ← Knowledge base
      </Link>
      <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="mt-1 text-muted">
            {doc.category} · {doc.document_type.toUpperCase()} · version {doc.version}
            {doc.source ? ` · ${doc.source}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={doc.status === "approved" ? "success" : doc.status === "failed" ? "danger" : "warning"}>{doc.status.replace(/_/g, " ")}</Badge>
            <Badge tone={doc.active ? "success" : "neutral"} icon={false}>
              {doc.active ? "Used by assistant" : "Not used by assistant"}
            </Badge>
            <Badge tone={doc.embedding_status === "complete" ? "info" : "warning"} icon={false}>
              Embeddings: {doc.embedding_status}
            </Badge>
          </div>
        </div>
        <KnowledgeStatusButtons id={doc.id} status={doc.status} active={doc.active} />
      </div>
      {doc.error && <p className="mb-4 rounded-xl border border-danger/25 bg-danger-bg px-4 py-3 text-sm text-danger">{doc.error}</p>}
      <dl className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Uploaded</dt>
          <dd>{formatDateTime(doc.uploaded_at)}</dd>
        </div>
        <div>
          <dt className="text-muted">Reviewed</dt>
          <dd>{doc.reviewed_at ? formatDateTime(doc.reviewed_at) : "Not yet"}</dd>
        </div>
        <div>
          <dt className="text-muted">Passages</dt>
          <dd>{doc.chunk_count}</dd>
        </div>
        <div>
          <dt className="text-muted">Original file</dt>
          <dd>{fileUrl ? <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary-ink underline">Open (private link)</a> : "Pasted text"}</dd>
        </div>
      </dl>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="chunks">
          <SectionTitle id="chunks">Indexed passages (what the assistant can retrieve)</SectionTitle>
          <ol className="space-y-2">
            {chunks.map((c) => (
              <li key={c.id}>
                <Card className="p-4">
                  <p className="text-[12px] text-muted">
                    #{c.chunk_index + 1}
                    {typeof c.metadata?.heading === "string" ? ` · ${c.metadata.heading}` : ""} · ~{c.token_count} tokens
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{c.content}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>
        <aside>
          <Card className="p-5">
            <SectionTitle>Upload a new version</SectionTitle>
            <p className="mb-3 text-[13px] text-muted">The current version is archived when the new one is uploaded. Approve the new version to activate it.</p>
            <KnowledgeUpload categories={KNOWLEDGE_CATEGORIES} replacesId={doc.id} defaultCategory={doc.category} defaultTitle={doc.title} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
