"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startConversationAction } from "@/features/chat/actions";

/** Starts a health chat that reads this report and explains it. */
export function AskAboutReport({ reportId, profileId, title }: { reportId: string; profileId: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await startConversationAction(profileId, `Explain my report: ${title}`, { key: "report_file", value: reportId });
          if (r.ok) router.push(`/app/chat/${r.data!.conversationId}`);
        })
      }
    >
      <MessageCircle className="h-4 w-4" aria-hidden /> Ask about this report
    </Button>
  );
}
