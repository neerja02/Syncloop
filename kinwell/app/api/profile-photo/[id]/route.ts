import { NextResponse } from "next/server";
import { getActor } from "@/lib/security/session";
import { assertProfileAccess } from "@/lib/security/access";
import { getDb } from "@/lib/database/client";
import { getStorage } from "@/lib/integrations/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Sign in required", { status: 401 });
  const { id } = await params;
  try {
    await assertProfileAccess(actor, id);
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const db = await getDb();
  const key = (await db.query<{ photo_url: string | null }>("select photo_url from profiles where id = $1", [id])).rows[0]?.photo_url;
  const data = key ? await getStorage().get(key).catch(() => null) : null;
  if (!data) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" } });
}
