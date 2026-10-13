"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setSelectedProfileAction } from "@/features/shell/actions";

/** Opens a new chat already set to "Talking about <person>". */
export function ChatAboutButton({ profileId, label }: { profileId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="flex-1 sm:flex-none"
      loading={pending}
      onClick={() =>
        start(async () => {
          await setSelectedProfileAction(profileId);
          router.push(`/app?n=${Date.now()}`);
        })
      }
    >
      <MessageCircle className="h-4 w-4" aria-hidden /> {label}
    </Button>
  );
}
