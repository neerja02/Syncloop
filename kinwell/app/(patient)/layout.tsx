import { requirePatient } from "@/lib/security/session";
import { getDb } from "@/lib/database/client";
import { listFolders } from "@/lib/services/reports";
import { listConversations } from "@/lib/services/conversations";
import { getMyDoctor, getSavedCity, doctorAddressLine } from "@/lib/services/my-doctor";
import { resolveProfile } from "@/lib/server/selected-profile";
import { getAIProvider } from "@/lib/ai/providers";
import { AppShell } from "@/features/shell/app-shell";
import type { ShellData } from "@/features/shell/types";

export const dynamic = "force-dynamic";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePatient();
  const db = await getDb();
  const [{ profile, profiles }, folders, conversations, myDoctor, savedCity, family, prefs] = await Promise.all([
    resolveProfile(actor),
    listFolders(actor, actor.familyId),
    listConversations(actor, actor.familyId, { limit: 50 }),
    getMyDoctor(actor, actor.familyId),
    getSavedCity(actor.id),
    db.query<{ name: string; country_code: string }>("select name, country_code from families where id = $1", [actor.familyId]),
    db.query<{ large_text: boolean; high_contrast: boolean; reduce_motion: boolean }>("select large_text, high_contrast, reduce_motion from user_preferences where user_id = $1", [actor.id]),
  ]);
  const data: ShellData = {
    user: { id: actor.id, fullName: actor.fullName, email: actor.email, isDemo: actor.isDemo, emailVerified: actor.emailVerified, role: actor.role },
    familyId: actor.familyId,
    familyName: family.rows[0]?.name ?? "My family",
    countryCode: family.rows[0]?.country_code ?? "IN",
    profiles: profiles.map((p) => ({ id: p.id, display_name: p.display_name, relationship: p.relationship, avatar_color: p.avatar_color, date_of_birth: p.date_of_birth, has_photo: !!p.photo_url })),
    selectedProfileId: profile.id,
    folders: folders.map((f) => ({ id: f.id, name: f.name, icon: f.icon, report_count: f.report_count ?? 0 })),
    conversations: conversations.map((c) => ({ id: c.id, title: c.title, active_profile_name: c.active_profile_name, last_message_at: new Date(c.last_message_at).toISOString() })),
    myDoctor: myDoctor ? { name: myDoctor.name, specialisation: myDoctor.specialisation, clinic_name: myDoctor.clinic_name, phone: myDoctor.phone, address: [myDoctor.clinic_name, doctorAddressLine(myDoctor)].filter(Boolean).join(", ") || null } : null,
    savedCity,
    isMockAI: getAIProvider().isMock,
    prefs: { largeText: !!prefs.rows[0]?.large_text, highContrast: !!prefs.rows[0]?.high_contrast, reduceMotion: !!prefs.rows[0]?.reduce_motion },
  };
  return <AppShell data={data}>{children}</AppShell>;
}
