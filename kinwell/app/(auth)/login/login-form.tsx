"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { signInAction, magicLinkAction, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";

export function LoginForm({ next, oauth, devHint }: { next?: string; oauth: string[]; devHint: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, null);
  const [magic, magicAction, magicPending] = useActionState<FormState, FormData>(magicLinkAction, null);
  const [mode, setMode] = useState<"password" | "magic">("password");
  return (
    <div className="space-y-5">
      {mode === "password" ? (
        <form action={action} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next ?? ""} />
          <FormError message={state?.error} />
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.fields?.email} />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <label className="flex min-h-10 items-center gap-2.5 text-[15px] text-ink">
              <input type="checkbox" name="remember" defaultChecked className="h-[18px] w-[18px] accent-[var(--color-primary-dark)]" />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-[15px] font-medium text-primary-ink hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            Sign In
          </Button>
        </form>
      ) : (
        <form action={magicAction} className="space-y-4">
          {magic?.ok ? <div role="status" className="rounded-xl border border-success/25 bg-success-bg px-3.5 py-2.5 text-sm text-success">{magic.message}</div> : <FormError message={magic?.error} />}
          <Field label="Email" htmlFor="magic-email">
            <Input id="magic-email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={magicPending}>
            <Mail className="h-4 w-4" aria-hidden /> Email me a sign-in link
          </Button>
        </form>
      )}
      <button type="button" onClick={() => setMode(mode === "password" ? "magic" : "password")} className="block w-full text-center text-[14px] font-medium text-primary-ink hover:underline">
        {mode === "password" ? "Email me a sign-in link instead" : "Sign in with a password instead"}
      </button>
      {oauth.map((p) => (
        <a key={p} href={`/api/auth/oauth/${p}`} className="flex h-12 w-full items-center justify-center rounded-[var(--radius-btn)] border border-line bg-surface text-[15px] font-medium hover:bg-subtle">
          Continue with {p === "google" ? "Google" : "Apple"}
        </a>
      ))}
      {devHint && (
        <p className="rounded-xl bg-accent-light px-3.5 py-2.5 text-[13px] text-ink">
          <span className="font-semibold text-primary-dark">Demo account:</span> <code>demo@kinwell.health</code> · <code>Demo@1234</code>
        </p>
      )}
    </div>
  );
}
