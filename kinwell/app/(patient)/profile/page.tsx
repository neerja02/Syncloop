import Link from "next/link";
import { ChevronRight, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { requirePatient } from "@/lib/security/session";
import { getMyDoctor } from "@/lib/services/my-doctor";
import { familyProfiles } from "@/lib/server/selected-profile";
import { Avatar } from "@/components/ui/misc";
import { PageContainer } from "@/components/ui/page";
import { AccountForm } from "@/features/settings/components/settings-forms";
import { SignOutButton } from "@/features/settings/components/sign-out-button";

export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ verified?: string }> }) {
  const actor = await requirePatient();
  const { verified } = await searchParams;
  const [doctor, profiles] = await Promise.all([getMyDoctor(actor, actor.familyId), familyProfiles(actor.familyId)]);
  const links = [
    { href: "/my-doctor", icon: Stethoscope, label: "My Doctor", sub: doctor ? [doctor.name, doctor.specialisation].filter(Boolean).join(" · ") : "Add your regular doctor" },
    { href: "/family", icon: Users, label: "Family profiles", sub: `${profiles.length} ${profiles.length === 1 ? "person" : "people"}` },
    { href: "/profile/privacy", icon: ShieldCheck, label: "Privacy & data", sub: "Consent, export or delete your data" },
  ];
  return (
    <PageContainer>
      <div className="flex items-center gap-4">
        <Avatar name={actor.fullName} size={56} color="#28328C" />
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-semibold tracking-tight">{actor.fullName}</h1>
          <p className="truncate text-[15px] text-muted">{actor.email}</p>
        </div>
      </div>
      {verified && <p role="status" className="mt-4 rounded-xl border border-success/25 bg-success-bg px-3.5 py-2.5 text-sm text-success">Your email is verified. Thank you!</p>}

      <nav aria-label="Profile" className="mt-6 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex min-h-16 items-center gap-3.5 px-4 py-3 hover:bg-subtle">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-light text-primary-ink">
              <l.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{l.label}</span>
              <span className="block truncate text-[14px] text-muted">{l.sub}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
          </Link>
        ))}
      </nav>

      <section aria-labelledby="account" className="mt-8 space-y-4">
        <h2 id="account" className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Account
        </h2>
        <AccountForm name={actor.fullName} email={actor.email} country={actor.countryCode} verified={actor.emailVerified} />
      </section>

      <div className="mt-8">
        <SignOutButton />
      </div>
      <p className="mt-6 text-center text-[13px] text-muted">
        <Link href="/legal/privacy" className="hover:underline">
          Privacy policy
        </Link>{" "}
        ·{" "}
        <Link href="/legal/terms" className="hover:underline">
          Terms
        </Link>
        <br />
        Kinwell isn&apos;t a substitute for medical care.
      </p>
    </PageContainer>
  );
}
