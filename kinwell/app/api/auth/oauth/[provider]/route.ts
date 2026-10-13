import { NextResponse } from "next/server";

/**
 * OAuth entry point (Google / Apple). Architecture is ready: with AUTH_PROVIDER=supabase this should call
 * supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${APP_URL}/api/auth/callback` } }).
 * Buttons are only rendered when the provider's client id/secret are configured.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return NextResponse.json({ error: `${provider} sign-in is not configured on this deployment.` }, { status: 501 });
}
