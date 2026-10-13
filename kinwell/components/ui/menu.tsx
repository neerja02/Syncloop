"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-[200px] rounded-[12px] border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)]", className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, onSelect, className, danger }: { children: React.ReactNode; onSelect?: (e: Event) => void; className?: string; danger?: boolean }) {
  return (
    <M.Item onSelect={onSelect} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-subtle", danger && "text-danger", className)}>
      {children}
    </M.Item>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <M.Label className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium uppercase tracking-wide text-muted">{children}</M.Label>;
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
