"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronDown, CircleUserRound, FileText, LogOut, Menu as MenuIcon, MessageCircle, Plus, ShieldCheck, Siren, Users } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/misc";
import { signOutAction } from "@/features/auth/actions";
import { Dialog } from "@/components/ui/dialog";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";
import { RELATIONSHIP_LABELS, type Relationship } from "@/types/domain";
import { setSelectedProfileAction } from "./actions";
import { changeConversationProfileAction } from "@/features/chat/actions";
import { useShell } from "./shell-context";
import { ProfileAvatar } from "./profile-avatar";

/** "Talking about: Me ▼" — opens a bottom sheet (mobile) / small dialog (desktop) to pick a family member. */
export function ProfileSwitcher() {
  const shell = useShell();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const currentId = shell.conversation?.profileId ?? shell.selectedProfileId;
  const current = shell.profiles.find((p) => p.id === currentId) ?? shell.profiles[0];
  if (!current) return null;
  const label = (p: { display_name: string }) => p.display_name;
  const choose = (id: string) => {
    setOpen(false);
    if (id === current.id) return;
    start(async () => {
      if (shell.conversation) {
        const r = await changeConversationProfileAction(shell.conversation.id, id);
        if (r.ok) shell.conversation.onProfileChanged?.(r.data ?? [], id);
      }
      await setSelectedProfileAction(id);
      router.refresh();
    });
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("flex h-11 min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-left hover:bg-subtle", pending && "opacity-60")}
        aria-label={`Talking about ${label(current)}. Change person`}
      >
        <ProfileAvatar profile={current} size={30} />
        <span className="min-w-0 leading-tight">
          <span className="block text-[11.5px] text-muted">Talking about</span>
          <span className="flex items-center gap-0.5 text-[15px] font-semibold">
            <span className="max-w-[9rem] truncate">{label(current)}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          </span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Who is this about?" size="sm">
        <ul className="-mx-2 space-y-1">
          {shell.profiles.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => choose(p.id)} className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-subtle", p.id === current.id && "bg-accent-light")}>
                <ProfileAvatar profile={p} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{label(p)}</span>
                  <span className="block text-[13px] text-muted">{p.relationship === "self" ? "You" : p.relationship === "pet" ? "Pet" : RELATIONSHIP_LABELS[p.relationship as Relationship] ?? p.relationship}</span>
                </span>
                {p.id === current.id && <Check className="h-5 w-5 text-primary-ink" aria-label="Selected" />}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                shell.openDialog({ kind: "profile" });
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left text-primary-ink hover:bg-subtle"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-primary/40">
                <Plus className="h-4 w-4" aria-hidden />
              </span>
              <span className="font-medium">Add a family member</span>
            </button>
          </li>
        </ul>
      </Dialog>
    </>
  );
}

export function isChatPath(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/chat");
}

/** Avatar with Profile / Privacy / Sign out. */
function AccountMenu() {
  const shell = useShell();
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-subtle" aria-label="Account menu">
        <Avatar name={shell.user.fullName} size={32} color="#28328C" />
      </MenuTrigger>
      <MenuContent align="end" className="w-56">
        <div className="px-2.5 py-1.5">
          <p className="truncate text-[14px] font-medium">{shell.user.fullName}</p>
          <p className="truncate text-[12px] text-muted">{shell.user.email}</p>
        </div>
        <MenuSeparator />
        <MenuItem onSelect={() => router.push("/profile")}>
          <CircleUserRound className="h-4 w-4" /> Profile
        </MenuItem>
        <MenuItem onSelect={() => router.push("/profile/privacy")}>
          <ShieldCheck className="h-4 w-4" /> Privacy
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger onSelect={() => void signOutAction()}>
          <LogOut className="h-4 w-4" /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/**
 * Minimal header.
 * Phones: menu · current person (chat) or logo · avatar. New Chat and Emergency live in the menu drawer.
 * Desktop: current person on chat screens · Emergency and avatar at the top right.
 */
export function Topbar() {
  const shell = useShell();
  const pathname = usePathname();
  const onChat = isChatPath(pathname);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line/70 bg-page/90 px-2 backdrop-blur sm:px-3 lg:h-16 lg:border-transparent lg:px-5">
      <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-subtle lg:hidden" onClick={() => shell.setMobileNavOpen(true)} aria-label="Open menu">
        <MenuIcon className="h-[22px] w-[22px]" />
      </button>
      {onChat ? (
        <ProfileSwitcher />
      ) : (
        <Link href="/app" className="flex items-center gap-2 lg:hidden" aria-label="Kinwell home">
          <LogoMark size={28} />
          <span className="text-[17px] font-semibold tracking-tight text-primary-dark">Kinwell</span>
        </Link>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => shell.openDialog({ kind: "emergency" })}
          className="hidden h-10 items-center gap-1.5 rounded-full border border-danger/40 bg-danger-bg/60 px-3.5 text-[14px] font-semibold text-danger hover:bg-danger-bg lg:inline-flex"
        >
          <Siren className="h-[18px] w-[18px] shrink-0" aria-hidden /> Emergency
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}

const TABS = [
  { href: "/app", label: "Chat", icon: MessageCircle },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/family", label: "Family", icon: Users },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
] as const;

/** Mobile bottom navigation: four items only. Hidden while typing in the chat composer. */
export function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/app" ? isChatPath(pathname) : href === "/profile" ? pathname.startsWith("/profile") || pathname.startsWith("/my-doctor") : pathname.startsWith(href);
  return (
    <nav aria-label="Main" className="kw-bottom-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {TABS.map((t) => {
        const active = isActive(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[12px] font-medium", active ? "text-primary-dark" : "text-muted")}>
            <t.icon className="h-[22px] w-[22px] shrink-0" strokeWidth={active ? 2.1 : 1.8} aria-hidden />
            <span className="truncate">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
