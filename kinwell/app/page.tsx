import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, FileSearch, FileText, FlaskConical, Folder, MessageCircleQuestion, Stethoscope } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/button";
import { getSessionUser } from "@/lib/security/session";
import { features } from "@/lib/config/features";

const STEPS = [
  { title: "Tell it what's going on", body: "Tap “Check a Symptom”, share a report, or type in your own words. Choose who it's about — you, Mom, Dad or a child." },
  { title: "It asks the right questions", body: "One short question at a time, with buttons to tap. After every answer it checks for warning signs." },
  { title: "Get clear next steps", body: "Self-care tips, which kind of doctor to see, or urgent help when something can't wait." },
];

const HELPS = [
  { icon: Stethoscope, title: "Check a Symptom", body: "Pain, fever, cough, headache and more — guided questions instead of a blank text box." },
  { icon: FileSearch, title: "Analyse a Report", body: "Photograph or upload a lab report. Kinwell reads it and flags values outside the range." },
  { icon: FlaskConical, title: "Understand a Test Result", body: "Blood sugar, BP, HbA1c, cholesterol or thyroid — explained in plain language." },
  { icon: MessageCircleQuestion, title: "Ask a Health Question", body: "Diet, exercise, sleep or a medicine question, answered with your history in mind." },
];

const SAFETY = [
  { title: "Warning signs, checked every time", body: "If an answer points to something serious, the chat stops and shows emergency numbers and nearby care." },
  { title: "Guidance, never a diagnosis", body: "Kinwell suggests which kind of doctor to see — “a General Physician would be a good starting point” — and stops there." },
  { title: "Nothing saved without you", body: "Readings and symptoms are only added to a profile when you tap Save." },
];

const FAMILY = [
  { name: "Me", detail: "You · Type 2 diabetes", color: "#3D83DF" },
  { name: "Mom", detail: "Mother · Hypertension", color: "#BE185D" },
  { name: "Dad", detail: "Father · High cholesterol", color: "#B45309" },
];

const FOLDERS = ["Blood Tests", "Prescriptions", "Imaging", "General Reports"];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-primary-ink">{children}</p>;
}

function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`max-w-[30ch] text-balance text-[26px] font-semibold leading-tight tracking-tight sm:text-[34px] ${className}`}>{children}</h2>;
}

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user && !(user.role === "DOCTOR" && !features.doctorPortal)) redirect(user.role === "DOCTOR" ? "/doctor" : "/app");
  const wrap = "mx-auto max-w-[1080px] px-5";
  return (
    <div className="min-h-dvh bg-page">
      <header className={`${wrap} flex items-center justify-between py-4`}>
        <Logo />
        <nav className="flex items-center gap-1.5" aria-label="Main">
          <LinkButton href="/login" variant="ghost">
            Sign in
          </LinkButton>
          <LinkButton href="/signup" className="hidden sm:inline-flex">
            Get started
          </LinkButton>
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section className={`${wrap} grid items-center gap-9 pb-16 pt-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pb-22 lg:pt-14`}>
          <div>
            <h1 className="text-[32px] font-semibold leading-[1.12] tracking-tight sm:text-5xl">
              <span className="block">Your personal health agent.</span>
              <span className="block text-primary-dark">Your family&apos;s health companion.</span>
              <span className="block text-primary">All reports, one place.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">Tell Kinwell what you&apos;re feeling — mostly by tapping. It asks the right questions, checks for warning signs, explains your reports and tells you when it&apos;s time to see a doctor, and which kind.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/signup" size="lg">
                Get started — it&apos;s free
              </LinkButton>
              <LinkButton href="/login" size="lg" variant="secondary">
                Try the demo
              </LinkButton>
            </div>
            <p className="mt-4 text-[13px] text-muted">Health information, not a diagnosis. In an emergency, call your local emergency number.</p>
          </div>

          <div className="rounded-[24px] border border-line bg-surface p-5 shadow-[var(--shadow-pop)]" aria-label="Example conversation">
            <div className="space-y-3 text-[15px]">
              <p className="ml-auto w-fit max-w-[80%] rounded-[20px] rounded-br-md bg-primary px-4 py-2.5 text-white">I have pain on the left side.</p>
              <p className="w-fit max-w-[85%]">Let&apos;s narrow it down. Where exactly do you feel it?</p>
              <div className="flex flex-wrap gap-2">
                {["Chest", "Upper stomach", "Lower stomach", "Back", "Not sure"].map((c) => (
                  <span key={c} className="rounded-full border border-primary/25 px-3.5 py-1.5 text-[14px] font-medium text-primary-dark">
                    {c}
                  </span>
                ))}
              </div>
              <div className="rounded-2xl border border-primary/20 bg-accent-light/70 p-4">
                <p className="text-[13px] text-muted">You may want to speak with a</p>
                <p className="text-lg font-semibold text-primary-dark">General Physician</p>
                <p className="mt-1 text-sm text-muted">Because the pain has lasted a few days, a General Physician would be a good starting point.</p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-line bg-surface py-16 sm:py-22">
          <div className={wrap}>
            <Eyebrow>How it works</Eyebrow>
            <H2>Three steps from “something&apos;s not right” to a clear plan</H2>
            <ol className="mt-11 grid gap-7 md:grid-cols-3 md:gap-10">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-dark font-semibold text-white">{i + 1}</span>
                  <h3 className="mb-1.5 mt-4 text-[17px] font-semibold">{s.title}</h3>
                  <p className="text-[15.5px] text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Four ways to start */}
        <section className="py-16 sm:py-22">
          <div className={wrap}>
            <Eyebrow>What it helps with</Eyebrow>
            <H2>Four ways to start a conversation</H2>
            <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {HELPS.map((h) => (
                <div key={h.title} className="rounded-[18px] border border-line bg-surface p-5.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-accent-light text-primary-ink">
                    <h.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mb-1.5 mt-4 text-[17px] font-semibold">{h.title}</h3>
                  <p className="text-[15.5px] text-muted">{h.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Family */}
        <section className="border-y border-line bg-surface py-16 sm:py-22">
          <div className={`${wrap} grid items-center gap-8 lg:grid-cols-2 lg:gap-16`}>
            <div>
              <Eyebrow>Your family&apos;s health companion</Eyebrow>
              <H2>One app for everyone you look after</H2>
              <p className="mt-4 max-w-xl text-[17px] text-muted">Give each person their own private profile with their conditions, allergies and reports. Switch who you&apos;re talking about in one tap, and Kinwell answers with that person&apos;s history in mind.</p>
            </div>
            <div className="rounded-[24px] bg-accent-light p-6">
              <ul className="divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
                {FAMILY.map((f) => (
                  <li key={f.name} className="flex items-center gap-3.5 px-4 py-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: f.color }} aria-hidden>
                      {f.name[0]}
                    </span>
                    <span>
                      <span className="block font-semibold">{f.name}</span>
                      <span className="block text-[14px] text-muted">{f.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Reports */}
        <section className="py-16 sm:py-22">
          <div className={`${wrap} grid items-center gap-8 lg:grid-cols-2 lg:gap-16`}>
            <div className="order-2 rounded-[24px] bg-surface p-6 lg:order-1">
              <ul className="divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
                {FOLDERS.map((f) => (
                  <li key={f} className="flex items-center gap-3.5 px-4 py-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-light text-primary-ink">
                      <Folder className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="font-semibold">{f}</span>
                    <FileText className="ml-auto h-4 w-4 text-muted" aria-hidden />
                  </li>
                ))}
              </ul>
            </div>
            <div className="order-1 lg:order-2">
              <Eyebrow>All reports, one place</Eyebrow>
              <H2>Every lab report, for every family member</H2>
              <p className="mt-4 max-w-xl text-[17px] text-muted">Snap a photo or upload a PDF. Kinwell files it in the right folder, reads the values, compares them with earlier results, and never guesses a number it can&apos;t read clearly.</p>
            </div>
          </div>
        </section>

        {/* Safety */}
        <section className="border-y border-line bg-surface py-16 sm:py-22">
          <div className={wrap}>
            <Eyebrow>Safety first</Eyebrow>
            <H2>Careful by design</H2>
            <div className="mt-11 grid gap-7 md:grid-cols-3 md:gap-10">
              {SAFETY.map((s) => (
                <div key={s.title}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-bg text-success">
                    <Check className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <h3 className="mb-1.5 mt-4 text-[17px] font-semibold">{s.title}</h3>
                  <p className="text-[15.5px] text-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 text-center sm:py-22">
          <div className={wrap}>
            <H2 className="mx-auto">Start with how you&apos;re feeling today</H2>
            <p className="mx-auto mt-4 text-[17px] text-muted">Free for you and your family.</p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <LinkButton href="/signup" size="lg">
                Get started — it&apos;s free
              </LinkButton>
              <LinkButton href="/login" size="lg" variant="secondary">
                Try the demo
              </LinkButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={`${wrap} flex flex-col gap-2 py-6 text-[13px] text-muted sm:flex-row sm:justify-between`}>
          <span>© {new Date().getFullYear()} Kinwell. Not a substitute for professional medical advice.</span>
          <span className="flex gap-4">
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
