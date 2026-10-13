import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/"><Logo /></Link>
      <h1 className="mt-8 text-2xl font-semibold">Terms of use (template)</h1>
      <div className="mt-4 space-y-3 text-[15px] text-muted">
        <p>Kinwell helps families organise health information and understand it in plain language. It is not a medical device and does not diagnose, treat or replace professional medical care.</p>
        <p>In an emergency, call your local emergency number immediately. Kinwell is not monitored in real time.</p>
        <p>Your family doctor can see information for families assigned to them. You can end that assignment at any time in Settings.</p>
        <p>This is template text for a development build. Replace it with reviewed legal terms before launch.</p>
      </div>
    </main>
  );
}
