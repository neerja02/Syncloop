import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-6 mt-1 text-muted">You&apos;ll be signed out of other devices.</p>
      {token ? <ResetForm token={token} /> : <p className="text-sm text-danger">This reset link is missing its token. <Link className="underline" href="/forgot-password">Request a new link</Link>.</p>}
    </>
  );
}
