import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPolicyPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/"><Logo /></Link>
      <h1 className="mt-8 text-2xl font-semibold">Privacy policy (template)</h1>
      <div className="mt-4 space-y-3 text-[15px] text-muted">
        <p>Health information is stored privately, accessed only by your family members and your assigned doctor, and is never shown through public links.</p>
        <p>When you ask the assistant a question, only the information needed for that question is sent to the AI provider configured by the operator.</p>
        <p>You can export or delete your data at any time from Settings → Privacy.</p>
        <p>This is template text for a development build. Replace it with a reviewed privacy policy before launch.</p>
      </div>
    </main>
  );
}
