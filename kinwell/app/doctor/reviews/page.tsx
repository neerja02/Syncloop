import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireDoctor } from "@/lib/security/session";
import { listDoctorReviews } from "@/lib/services/reviews";
import { formatDateTime } from "@/lib/utils/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "Reviews" };
const PRIORITY_TONE = { urgent: "danger", soon: "warning", routine: "neutral" } as const;

export default async function DoctorReviews({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "open" } = await searchParams;
  const actor = await requireDoctor();
  const reviews = await listDoctorReviews(actor, tab === "responded" ? "responded" : tab === "all" ? "all" : "open");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Review requests" description="Cases sent by families from the assistant, with the conversation, readings and sources attached." />
      <div className="mb-4 flex gap-1 rounded-[10px] bg-subtle p-1 text-sm sm:w-fit" role="tablist">
        {[
          ["open", "Open"],
          ["responded", "Responded"],
          ["all", "All"],
        ].map(([k, l]) => (
          <Link key={k} href={`/doctor/reviews?tab=${k}`} role="tab" aria-selected={tab === k} className={cn("rounded-[8px] px-3 py-1.5", tab === k ? "bg-surface font-medium shadow-sm" : "text-muted")}>
            {l}
          </Link>
        ))}
      </div>
      {reviews.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Nothing here" description="New review requests will appear here and in your notifications." />
      ) : (
        <Card className="divide-y divide-line">
          {reviews.map((r) => (
            <Link key={r.id} href={`/doctor/reviews/${r.id}`} className="block p-4 hover:bg-subtle">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.profile_name}</span>
                <span className="text-sm text-muted">· {r.family_name}</span>
                <Badge tone={PRIORITY_TONE[r.priority as keyof typeof PRIORITY_TONE] ?? "neutral"} className="ml-auto">
                  {r.priority}
                </Badge>
                <Badge tone={r.status === "pending" ? "info" : r.status === "responded" ? "success" : "neutral"} icon={false}>
                  {r.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-[15px]">{r.question}</p>
              <p className="mt-1 text-[12px] text-muted">{formatDateTime(r.created_at)}</p>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
