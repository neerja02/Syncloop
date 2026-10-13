import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/config/env";
import { runReminderJob } from "@/lib/services/notifications";
import { safeEqual } from "@/lib/security/crypto";

/** Call every 15 minutes (Vercel Cron, Supabase scheduled function, or any scheduler) with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const ok = env.cronSecret ? safeEqual(auth, `Bearer ${env.cronSecret}`) : !env.isProduction;
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runReminderJob());
}
