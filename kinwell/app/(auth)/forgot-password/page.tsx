"use client";
import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, null);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mb-6 mt-1 text-muted">Enter the email you use for Kinwell and we&apos;ll send a reset link.</p>
      {state?.ok ? (
        <div role="status" className="rounded-xl border border-success/25 bg-success-bg px-4 py-3 text-sm text-success">
          {state.message}
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <FormError message={state?.error} />
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-primary-ink hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
