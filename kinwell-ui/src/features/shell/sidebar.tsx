import Link from "@/adapters/link";
import { usePathname, useRouter } from "@/adapters/navigation";
import { useMemo, useState, useTransition } from "react";
import { CircleUserRound, FileText, LogOut, MessageCircle, MoreHorizontal, Search, Siren, SquarePen, Stethoscope, Trash2, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils/cn";
import { relativeDay } from "@/lib/utils/format";
import { signOutAction } from "@/api/auth";
import { deleteConversationAction } from "@/api/chat";
import { useShell } from "./shell-context";

function NavLink({ href, icon: Icon, children, active, onClick }: { href: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-ink/85 hover:bg-subtle lg:min-h-10", active && "bg-accent-light font-medium text-primary-dark hover:bg-accent-light")}
    >
      <Icon className={cn("h-5 w-5 shrink-0 text-muted", active && "text-primary-dark")} />
      <span className="truncate">{children}</span>
    </Link>
  );
}

function ChatRow({ id, title, active, onNavigate }: { id: string; title: string; active: boolean; onNavigate: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={cn("group relative flex items-center rounded-xl hover:bg-subtle", active && "bg-accent-light hover:bg-accent-light", pending && "opacity-50")}>
      <Link href={`/app/chat/${id}`} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("min-h-11 min-w-0 flex-1 truncate py-2.5 pl-3 pr-10 text-[15px] lg:min-h-10 lg:py-2 lg:text-[14px]", active ? "font-medium text-primary-dark" : "text-ink/85")}>
        {title}
      </Link>
      <Menu>
        <MenuTrigger className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-line/60 hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 lg:data-[state=open]:opacity-100" aria-label={`Options for ${title}`}>
          <MoreHorizontal className="h-4 w-4" />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem
            danger
            onSelect={() => {
              if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
              start(async () => {
                await deleteConversationAction(id);
                if (active) router.push("/app");
                router.refresh();
              });
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete chat
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

/** Narrow, quiet ChatGPT-style sidebar. On phones the same content is the menu drawer, with Emergency,
 * Profile and Logout added at the bottom (desktop has those in the header). */
export function Sidebar({ variant = "desktop" }: { variant?: "desktop" | "drawer" }) {
  const shell = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const close = () => shell.setMobileNavOpen(false);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = shell.conversations.filter((c) => !needle || c.title.toLowerCase().includes(needle) || c.active_profile_name.toLowerCase().includes(needle));
    const g = new Map<string, typeof filtered>();
    for (const c of filtered) {
      const k = relativeDay(c.last_message_at);
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return [...g.entries()];
  }, [shell.conversations, q]);

  return (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex h-16 items-center px-4">
        <Link href="/app" onClick={close} aria-label="Kinwell home">
          <Logo size={28} />
        </Link>
      </div>
      <div className="space-y-2 px-3">
        <button
          type="button"
          onClick={() => {
            close();
            router.push(`/app?n=${Date.now()}`);
          }}
          className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-[15px] font-medium text-ink hover:bg-subtle lg:h-10"
        >
          <SquarePen className="h-5 w-5 shrink-0 text-primary-dark" aria-hidden /> New Chat
        </button>
        <div role="search" className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            type="search"
            className="h-11 w-full rounded-xl bg-subtle pl-9 pr-3 text-[16px] placeholder:text-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 lg:h-10 lg:text-[14px]"
          />
        </div>
      </div>

      <div className="scrollbar-thin mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 && <p className="px-3 py-2 text-[14px] text-muted">{q ? "No chats match." : "Your chats will appear here."}</p>}
        {groups.map(([label, items]) => (
          <div key={label} className="mb-3">
            <div className="px-3 pb-1 text-[12px] font-medium text-muted">{label}</div>
            {items.map((c) => (
              <ChatRow key={c.id} id={c.id} title={c.title} active={pathname === `/app/chat/${c.id}`} onNavigate={close} />
            ))}
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-t border-line px-2 py-2">
        <NavLink href="/app" icon={MessageCircle} active={pathname === "/app" || pathname.startsWith("/app/")} onClick={close}>
          Chat
        </NavLink>
        <NavLink href="/reports" icon={FileText} active={pathname.startsWith("/reports")} onClick={close}>
          Reports
        </NavLink>
        <NavLink href="/family" icon={Users} active={pathname.startsWith("/family")} onClick={close}>
          Family
        </NavLink>
        <NavLink href="/my-doctor" icon={Stethoscope} active={pathname.startsWith("/my-doctor")} onClick={close}>
          My Doctor
        </NavLink>
      </div>
      {variant === "drawer" && (
        <div className="space-y-0.5 border-t border-line px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              close();
              shell.openDialog({ kind: "emergency" });
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-danger-bg px-3 text-[15px] font-semibold text-danger hover:bg-danger-bg/80"
          >
            <Siren className="h-5 w-5 shrink-0" aria-hidden /> Emergency
          </button>
          <NavLink href="/profile" icon={CircleUserRound} active={pathname.startsWith("/profile")} onClick={close}>
            Profile
          </NavLink>
          <button type="button" onClick={() => void signOutAction()} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] text-ink/85 hover:bg-subtle">
            <LogOut className="h-5 w-5 shrink-0 text-muted" aria-hidden /> Logout
          </button>
        </div>
      )}
    </nav>
  );
}
