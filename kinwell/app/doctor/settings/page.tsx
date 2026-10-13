import { requireDoctor } from "@/lib/security/session";
import { getDoctorProfile } from "@/lib/services/doctor";
import { loadClinicalRules } from "@/lib/clinical/rules-repo";
import { Card, PageHeader, SectionTitle } from "@/components/ui/misc";
import { DoctorProfileForm } from "@/features/doctor/components/doctor-forms";
import { RulesTable } from "@/features/clinical/rules-table";

export const metadata = { title: "Doctor settings" };

export default async function DoctorSettings() {
  const actor = await requireDoctor();
  const [doctor, rules] = await Promise.all([getDoctorProfile(actor), loadClinicalRules(true)]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Settings" />
      <Card className="p-5">
        <SectionTitle>Your profile (shown to families)</SectionTitle>
        <DoctorProfileForm doctor={doctor} />
      </Card>
      <div className="mt-8">
        <SectionTitle>Clinical rules</SectionTitle>
        <p className="-mt-2 mb-4 text-sm text-muted">
          Thresholds and triage patterns the assistant uses to classify readings and detect urgent situations. Edits create a new, attributed version; the previous version is kept for audit. Demo rules are marked “pending clinical review” and must be reviewed before production use.
        </p>
        <RulesTable rules={rules} editable />
      </div>
    </div>
  );
}
