import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Dialog({ open, onOpenChange, title, description, children, size = "md", side }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; size?: "sm" | "md" | "lg"; side?: "right" }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[1px] data-[state=open]:animate-in" />
        <D.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col bg-surface shadow-[var(--shadow-pop)] focus:outline-none",
            side === "right"
              ? "inset-y-0 right-0 w-full max-w-md border-l border-line"
              : cn(
                  "inset-x-0 bottom-0 rounded-t-[20px] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-card)] sm:border sm:border-line w-full",
                  size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
                ),
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="-mr-1 rounded-lg p-1.5 text-muted hover:bg-subtle" aria-label="Close">
              <X className="h-5 w-5" />
            </D.Close>
          </div>
          <div className="scrollbar-thin overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
