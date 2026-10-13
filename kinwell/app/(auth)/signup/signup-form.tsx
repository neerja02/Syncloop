"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";

/** Account details only — health and family details come later, in onboarding. */
export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <Field label="Full Name" htmlFor="fullName">
        <Input id="fullName" name="fullName" autoComplete="name" required defaultValue={state?.fields?.fullName} />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.fields?.email} />
      </Field>
      <Field label="Password" htmlFor="password" hint="(8+ characters, a letter and a number)">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm Password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <label className="flex items-start gap-2.5 text-[13.5px] text-muted">
        <input type="checkbox" name="acceptTerms" className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--color-primary-dark)]" required />
        <span>
          I agree to the{" "}
          <Link href="/legal/terms" className="text-primary-ink underline">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="text-primary-ink underline">
            privacy policy
          </Link>
          , and understand Kinwell doesn&apos;t replace a doctor.
        </span>
      </label>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create Account
      </Button>
    </form>
  );
}
