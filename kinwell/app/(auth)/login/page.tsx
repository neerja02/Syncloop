import Link from "next/link";
import { redirect } from "next/navigation";
import { features } from "@/lib/config/features";
import { getSessionUser } from "@/lib/security/session";
import { getAuthProvider } from "@/lib/security/auth-provider";
import { env } from "@/lib/config/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const user = await getSessionUser();
  if (user && !(user.role === "DOCTOR" && !features.doctorPortal)) redirect(user.role === "DOCTOR" ? "/doctor" : "/app");
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-[26px] font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted">Continue with your personal health agent.</p>
      {error === "doctor" && <p role="alert" className="mb-4 rounded-xl border border-warning/30 bg-warning-bg px-3.5 py-2.5 text-sm text-warning">Doctor accounts aren&apos;t part of this version of Kinwell. Please sign in with a personal account.</p>}
      {error === "link" && <p role="alert" className="mb-4 rounded-xl border border-warning/30 bg-warning-bg px-3.5 py-2.5 text-sm text-warning">That link is invalid or has expired. Please request a new one.</p>}
      <LoginForm next={next} oauth={getAuthProvider().oauthProviders()} devHint={!env.isProduction || process.env.SHOW_DEMO_ACCOUNTS === "true"} />
      <p className="mt-6 text-center text-[15px] text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-primary-dark hover:underline">
          Create Account
        </Link>
      </p>
    </>
  );
}
