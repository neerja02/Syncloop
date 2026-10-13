import { NextResponse, type NextRequest } from "next/server";
import { getAuthProvider } from "@/lib/security/auth-provider";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const res = token ? await getAuthProvider().consumeToken(token, "verify_email") : null;
  return NextResponse.redirect(new URL(res ? "/settings/profile?verified=1" : "/login?error=link", req.url));
}
