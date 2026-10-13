import { NextResponse } from "next/server";
import { getActor } from "@/lib/security/session";
import { getDb } from "@/lib/database/client";
import { getStorage } from "@/lib/integrations/storage";

/** Serves the family's "My Doctor" photo to members of that family only. */
export async function GET() {
  const actor = await getActor();
  if (!actor?.familyId) return new NextResponse("Sign in required", { status: 401 });
  const db = await getDb();
  const key = (await db.query<{ photo_path: string | null }>("select photo_path from my_doctors where family_id = $1", [actor.familyId])).rows[0]?.photo_path;
  const data = key ? await getStorage().get(key).catch(() => null) : null;
  if (!data) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60" } });
}
