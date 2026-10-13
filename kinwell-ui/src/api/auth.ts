import { call } from "./client";

/** Result of the auth form actions. */
export type FormState = { error?: string | null; ok?: boolean; message?: string | null; fields?: Record<string, string> } | null;

/** Ends the session. The Next.js app redirects to the landing page afterwards; do the same in your router. */
export async function signOutAction() {
  await call<unknown>("signOutAction");
  window.location.assign("/");
}

export const resendVerificationAction = () => call<FormState>("resendVerificationAction");
