"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardCheck, LayoutDashboard, LogOut, MessageSquare, Settings, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";
import { signOutAction } from "@/features/auth/actions";

const NAV = [
  { href: "/doctor", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/doctor/families", label: "Families & patients", icon: Users },
  { href: "/doctor/reviews", label: "Reviews", icon: ClipboardCheck, badge: "reviews" },
  { href: "/doctor/messages", label: "Messages", icon: MessageSquare, badge: "messages" },
  { href: "/doctor/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/doctor/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/doctor/settings", label: "Settings & rules", icon: Settings },
] as const;

export function DoctorNav({ name, speciality, counts }: { name: string; speciality: string; counts: { reviews: number; messages: number } }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 py-4">
          <Link href="/doctor">
            <Logo size={26} />
          </Link>
          <p className="mt-1 text-[12px] font-semibold uppercase tracking-wider text-primary-ink">Doctor portal</p>
        </div>
        <nav aria-label="Doctor" className="flex-1 space-y-0.5 px-3">
          {NAV.map((n) => {
            const count = "badge" in n ? counts[n.badge] : 0;
            return (
              <Link key={n.href} href={n.href} aria-current={active(n.href, "exact" in n && n.exact) ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[14px] hover:bg-subtle", active(n.href, "exact" in n && n.exact) && "bg-accent-light/60 font-medium text-primary-dark")}>
                <n.icon className="h-[18px] w-[18px]" aria-hidden />
                <span className="flex-1">{n.label}</span>
                {count > 0 && <span className="tabular rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">{count}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <p className="px-2 text-[14px] font-medium">{name}</p>
          <p className="px-2 text-[12px] text-muted">{speciality}</p>
          <button type="button" onClick={() => void signOutAction()} className="mt-2 flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-[14px] text-muted hover:bg-subtle hover:text-ink">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <header className="sticky top-0 z-30 border-b border-line bg-surface lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/doctor">
            <Logo size={24} />
          </Link>
          <button type="button" onClick={() => void signOutAction()} className="text-sm text-muted" aria-label="Sign out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Doctor sections" className="scrollbar-thin flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-[13px]", active(n.href, "exact" in n && n.exact) ? "bg-primary text-white" : "bg-subtle text-ink")}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
