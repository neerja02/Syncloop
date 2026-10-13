import { useEffect } from "react";
import { usePathname } from "@/adapters/navigation";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ShellProvider, useShell } from "./shell-context";
import { Sidebar } from "./sidebar";
import { MobileNav, Topbar } from "./topbar";
import { DialogHost } from "./dialog-host";
import type { ShellData } from "./types";

function MobileDrawer() {
  const shell = useShell();
  const pathname = usePathname();
  useEffect(() => shell.setMobileNavOpen(false), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <D.Root open={shell.mobileNavOpen} onOpenChange={shell.setMobileNavOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" />
        <D.Content className="fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[320px] bg-surface shadow-[var(--shadow-pop)] focus:outline-none lg:hidden">
          <D.Title className="sr-only">Chats and menu</D.Title>
          <D.Description className="sr-only">Chat history, reports, family and your doctor</D.Description>
          <D.Close className="absolute right-2 top-2.5 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-subtle" aria-label="Close menu">
            <X className="h-5 w-5" />
          </D.Close>
          <Sidebar variant="drawer" />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function A11yPrefs() {
  const { prefs } = useShell();
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.largeText = String(prefs.largeText);
    el.dataset.highContrast = String(prefs.highContrast);
    el.dataset.reduceMotion = String(prefs.reduceMotion);
  }, [prefs]);
  return null;
}

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  return (
    <ShellProvider data={data}>
      <A11yPrefs />
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 border-r border-line bg-surface lg:block">
          <Sidebar />
        </aside>
        <MobileDrawer />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" className="flex min-h-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
      <DialogHost />
    </ShellProvider>
  );
}
