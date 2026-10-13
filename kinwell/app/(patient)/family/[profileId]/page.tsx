import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, FileText, HeartPulse, MessageCircle, Pill, Stethoscope } from "lucide-react";
import { PATIENT_TIMELINE_KINDS, profileTimeline } from "@/lib/services/timeline";
import { requirePatient } from "@/lib/security/session";
import { getProfile, getEmergencyContacts } from "@/lib/services/profiles";
import { listAllergies, listConditions } from "@/lib/services/health-record";
import { listReports } from "@/lib/services/reports";
import { listConversations } from "@/lib/services/conversations";
import { ForbiddenError, NotFoundError } from "@/lib/security/access";
import { ageFromDob, formatDate } from "@/lib/utils/format";
import { RELATIONSHIP_LABELS, SPECIES_LABELS } from "@/types/domain";
import { Card, SectionTitle } from "@/components/ui/misc";
import { PageContainer } from "@/components/ui/page";
import { ProfileAvatar } from "@/features/shell/profile-avatar";
import { DeleteProfile, EditProfileButton, EmergencyContacts, PhotoButton } from "@/features/family/components/profile-editor";
import { AllergiesEditor, ConditionsEditor } from "@/features/family/components/record-editors";
import { ChatAboutButton } from "@/features/family/components/chat-about-button";

export const metadata = { title: "Family member" };

const TIMELINE_FILTERS: [string, string][] = [
  ["all", "All"],
  ["symptom", "Symptoms"],
  ["check_in", "Check-ins"],
  ["report", "Reports"],
  ["measurement", "Readings"],
  ["medication", "Medicines"],
  ["appointment", "Doctor visits"],
  ["condition", "Conditions"],
];
const TIMELINE_ICONS = { symptom: Stethoscope, check_in: CalendarCheck, report: FileText, measurement: Activity, medication: Pill, appointment: CalendarDays, condition: HeartPulse } as const;

export default async function FamilyMemberPage({ params, searchParams }: { params: Promise<{ profileId: string }>; searchParams: Promise<{ t?: string }> }) {
  const { profileId } = await params;
  const { t } = await searchParams;
  const filter = t && PATIENT_TIMELINE_KINDS.includes(t) ? t : "all";
  const actor = await requirePatient();
  let profile;
  try {
    profile = await getProfile(actor, profileId);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  const [conditions, allergies, contacts, reports, chats, timeline] = await Promise.all([
    listConditions(actor, profileId),
    listAllergies(actor, profileId),
    getEmergencyContacts(actor, profileId),
    listReports(actor, profile.family_id, { profileId, limit: 5 }),
    listConversations(actor, profile.family_id, { profileId, limit: 5 }),
    profileTimeline(actor, profileId, { kinds: filter === "all" ? PATIENT_TIMELINE_KINDS : [filter], limit: 30 }),
  ]);
  const age = ageFromDob(profile.date_of_birth);
  const isSelf = profile.relationship === "self";
  const pet = profile.relationship === "pet";
  const ls = (profile.lifestyle ?? {}) as Record<string, string | number | undefined>;
  const FEEDING: Record<string, string> = { breast: "Breast milk", formula: "Formula", mixed: "Breast milk and formula", solids: "Solids" };
  const details: [string, string | null][] = pet
    ? [
        ["Animal", SPECIES_LABELS[profile.species ?? "other"] ?? null],
        ["Breed", profile.breed ?? null],
        ["Weight", profile.weight_kg ? `${profile.weight_kg} kg` : null],
        ...(profile.neutered != null ? ([["Neutered", profile.neutered ? "Yes" : "No"]] as [string, string][]) : []),
        ...(ls.diet ? ([["Diet", String(ls.diet)]] as [string, string][]) : []),
        ...(ls.vaccinations ? ([["Vaccinations", String(ls.vaccinations)]] as [string, string][]) : []),
      ]
    : [
        ["Date of birth", profile.date_of_birth ? formatDate(profile.date_of_birth) : null],
        ["Sex", profile.sex ? profile.sex.replace(/_/g, " ") : null],
        ["Blood group", profile.blood_group],
        ...(ls.bornWeeks ? ([["Born at", `${ls.bornWeeks} weeks`]] as [string, string][]) : []),
        ...(ls.birthWeightKg ? ([["Birth weight", `${ls.birthWeightKg} kg`]] as [string, string][]) : []),
        ...(ls.feeding ? ([["Feeding", FEEDING[String(ls.feeding)] ?? String(ls.feeding)]] as [string, string][]) : []),
        ...(ls.vaccinations ? ([["Vaccinations", String(ls.vaccinations)]] as [string, string][]) : []),
      ];

  return (
    <PageContainer>
      <Link href="/family" className="mb-3 inline-flex min-h-10 items-center gap-1 text-[15px] text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Family
      </Link>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <ProfileAvatar profile={profile} size={64} />
          <PhotoButton profileId={profile.id} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-semibold tracking-tight">{profile.display_name}</h1>
          <p className="text-[15px] text-muted">
            {isSelf ? "You" : pet ? [SPECIES_LABELS[profile.species ?? "other"], profile.breed].filter(Boolean).join(" · ") : RELATIONSHIP_LABELS[profile.relationship]}
            {age != null ? ` · ${age} years` : ""}
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <ChatAboutButton profileId={profile.id} label={isSelf ? "Start a chat" : `Chat about ${profile.display_name}`} />
        <EditProfileButton profile={profile} />
      </div>

      <div className="mt-6 space-y-6">
        <Card className="p-4">
          <dl className="grid grid-cols-3 gap-3 text-[15px]">
            {details.map(([k, v]) => (
              <div key={k} className={k === "Diet" || k === "Vaccinations" ? "col-span-3 min-w-0" : "min-w-0"}>
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className={k === "Diet" || k === "Vaccinations" ? "break-words" : "truncate first-letter:uppercase"}>{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <section aria-labelledby="conditions">
          <SectionTitle id="conditions">Known conditions</SectionTitle>
          <ConditionsEditor profileId={profile.id} conditions={conditions} />
        </section>

        <section aria-labelledby="allergies">
          <SectionTitle id="allergies">Allergies</SectionTitle>
          <AllergiesEditor profileId={profile.id} allergies={allergies} />
        </section>

        <section aria-labelledby="timeline-h" id="timeline">
          <SectionTitle id="timeline-h">Health timeline</SectionTitle>
          <nav aria-label="Filter the timeline" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
            {TIMELINE_FILTERS.map(([value, label]) => (
              <Link
                key={value}
                href={value === "all" ? `/family/${profile.id}#timeline` : `/family/${profile.id}?t=${value}#timeline`}
                scroll={false}
                aria-current={filter === value ? "true" : undefined}
                className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-[14px] ${filter === value ? "border-primary bg-accent-light font-medium text-primary-ink" : "border-line bg-surface text-muted hover:text-ink"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          {timeline.length === 0 ? (
            <p className="text-[15px] text-muted">
              {filter === "all" ? "Nothing here yet. Symptom checks you save, check-ins, reports and readings will appear here." : "Nothing of this type yet."}
            </p>
          ) : (
            <ol className="relative ml-2 border-l border-line">
              {timeline.map((e) => {
                const Icon = TIMELINE_ICONS[e.kind as keyof typeof TIMELINE_ICONS] ?? Activity;
                const body = (
                  <>
                    <span className="absolute -left-[13px] top-3 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface">
                      <Icon className="h-3.5 w-3.5 text-primary-ink" aria-hidden />
                    </span>
                    <span className="block text-[13px] text-muted">{formatDate(e.at)}</span>
                    <span className="block font-medium first-letter:uppercase">{e.title}</span>
                    {e.detail && <span className="line-clamp-2 block text-[14px] text-muted first-letter:uppercase">{e.detail}</span>}
                  </>
                );
                return (
                  <li key={`${e.kind}-${e.id}`} className="relative pb-3 pl-6">
                    {e.href ? (
                      <Link href={e.href} className="block rounded-lg py-1.5 hover:bg-subtle">
                        {body}
                      </Link>
                    ) : (
                      <div className="py-1.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section aria-labelledby="reports-h">
          <SectionTitle
            id="reports-h"
            action={
              <Link href={`/reports?profile=${profile.id}`} className="text-[14px] font-medium text-primary-ink hover:underline">
                All reports
              </Link>
            }
          >
            Reports
          </SectionTitle>
          {reports.length === 0 ? (
            <p className="text-[15px] text-muted">No reports yet.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/reports/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-subtle">
                    <FileText className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="text-[13px] text-muted">{formatDate(r.report_date ?? r.created_at)}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {chats.length > 0 && (
          <section aria-labelledby="chats-h">
            <SectionTitle id="chats-h">Recent chats</SectionTitle>
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/chat/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-subtle">
                    <MessageCircle className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="text-[13px] text-muted">{formatDate(c.last_message_at)}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="emergency-contacts" aria-labelledby="ec">
          <SectionTitle id="ec">Emergency contact</SectionTitle>
          <EmergencyContacts profileId={profile.id} contacts={contacts} />
        </section>

        {!isSelf && (
          <section aria-labelledby="danger" className="rounded-[var(--radius-card)] border border-danger/20 p-4">
            <h2 id="danger" className="text-[15px] font-semibold text-danger">
              Delete profile
            </h2>
            <p className="mb-3 mt-1 text-sm text-muted">This removes all of {profile.display_name}&apos;s health information and files. It can&apos;t be undone.</p>
            <DeleteProfile profileId={profile.id} name={profile.display_name} isSelf={false} />
          </section>
        )}
      </div>
    </PageContainer>
  );
}
