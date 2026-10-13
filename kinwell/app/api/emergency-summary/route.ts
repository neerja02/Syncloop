import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/lib/security/session";
import { emergencySummary } from "@/lib/services/emergency-summary";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Sign in required", { status: 401 });
  try {
    const s = await emergencySummary(actor, req.nextUrl.searchParams.get("profile") ?? "");
    return new NextResponse(s.text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
}
