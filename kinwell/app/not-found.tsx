import { LinkButton } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <LogoMark size={40} />
      <h1 className="mt-6 text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-2 max-w-sm text-muted">It may have been moved, deleted, or you may not have access to it.</p>
      <LinkButton href="/app" className="mt-6">
        Go to Kinwell
      </LinkButton>
    </main>
  );
}
