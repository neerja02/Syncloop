import Link from "next/link";
import { requireAdmin } from "@/lib/security/session";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Logo size={24} />
          <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Admin</span>
          <nav className="ml-auto flex gap-4 text-sm" aria-label="Admin">
            <Link href="/admin">Overview &amp; rules</Link>
            <Link href="/dev/mailbox">Dev mailbox</Link>
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
