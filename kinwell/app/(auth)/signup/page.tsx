import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-[26px] font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted">Start organising your family&apos;s health in one place.</p>
      <SignupForm />
      <p className="mt-6 text-center text-[15px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary-dark hover:underline">
          Sign In
        </Link>
      </p>
    </>
  );
}
