import Link from "next/link";
import { FileText, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const BENEFITS = [
  { icon: Stethoscope, text: "Check symptoms and know which doctor to see" },
  { icon: FileText, text: "Keep every report organised, for every family member" },
  { icon: Users, text: "Separate private profiles for the people you care for" },
];

/** Light, calm auth layout: a quiet benefit column on wide screens, a white form card, plenty of space. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-page">
      <div className="mx-auto grid min-h-dvh max-w-[1120px] items-center gap-12 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-20 lg:px-10">
        <aside className="hidden lg:block">
          <Link href="/" aria-label="Kinwell home">
            <Logo size={32} />
          </Link>
          <p className="mt-14 max-w-md text-balance text-[34px] font-semibold leading-[1.15] tracking-tight text-ink">Your personal health agent for you and your family.</p>
          <p className="mt-4 max-w-md text-[17px] text-muted">Keep reports organised, ask health questions and manage family health context in one place.</p>
          <ul className="mt-10 space-y-4">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-center gap-3.5 text-[15.5px] text-ink">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-light text-primary-dark">
                  <b.icon className="h-5 w-5" aria-hidden />
                </span>
                {b.text}
              </li>
            ))}
          </ul>
          <p className="mt-12 flex items-center gap-2 text-[13px] text-muted">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden /> Private by default. Your records stay with your family.
          </p>
        </aside>
        <main id="main" className="w-full">
          <Link href="/" className="mb-8 inline-flex lg:hidden" aria-label="Kinwell home">
            <Logo size={30} />
          </Link>
          <div className="w-full sm:rounded-[20px] sm:border sm:border-line sm:bg-surface sm:p-8 sm:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-18px_rgba(40,50,140,0.18)]">{children}</div>
        </main>
      </div>
    </div>
  );
}
