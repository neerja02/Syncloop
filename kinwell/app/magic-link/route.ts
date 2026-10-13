import { NextResponse, type NextRequest } from "next/server";
import { getAuthProvider } from "@/lib/security/auth-provider";
import { createSession } from "@/lib/security/session";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const res = token ? await getAuthProvider().consumeToken(token, "magic_link") : null;
  if (!res) return NextResponse.redirect(new URL("/login?error=link", req.url));
  await createSession(res.userId);
  return NextResponse.redirect(new URL("/app", req.url));
}
