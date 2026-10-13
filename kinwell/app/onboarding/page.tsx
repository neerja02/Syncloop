import { features } from "@/lib/config/features";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/security/session";
import { SUPPORTED_COUNTRIES } from "@/lib/clinical/emergency-config";
import { OnboardingWizard } from "./wizard";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/onboarding");
  if (user.role === "DOCTOR") redirect(features.doctorPortal ? "/doctor" : "/login?error=doctor");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.onboardingCompleted) redirect("/app");
  return <OnboardingWizard name={user.fullName} countries={SUPPORTED_COUNTRIES} emailVerified={user.emailVerified} />;
}
