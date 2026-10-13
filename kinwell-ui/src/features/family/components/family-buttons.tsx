import { useEffect } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShell } from "@/features/shell/shell-context";

export function AddProfileButton({ tile }: { tile?: boolean }) {
  const shell = useShell();
  if (tile)
    return (
      <button type="button" onClick={() => shell.openDialog({ kind: "profile" })} className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-line text-muted hover:border-primary/40 hover:text-primary-ink">
        <UserPlus className="h-7 w-7" aria-hidden />
        <span className="font-medium">Add a profile</span>
      </button>
    );
  return (
    <Button onClick={() => shell.openDialog({ kind: "profile" })}>
      <UserPlus className="h-4 w-4" aria-hidden /> Add profile
    </Button>
  );
}

export function AutoOpenAddProfile({ relationship }: { relationship: string }) {
  const shell = useShell();
  const { openDialog } = shell;
  useEffect(() => openDialog({ kind: "profile", relationship }), [openDialog, relationship]);
  return null;
}
