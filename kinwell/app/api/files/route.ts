import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/lib/security/session";
import { getStorage, verifyFileToken } from "@/lib/integrations/storage";
import { authoriseFileKey } from "@/lib/services/reports";
import { logAccess } from "@/lib/security/access";

/**
 * Private file delivery. Requires (1) a valid, unexpired signature bound to the requesting user AND
 * (2) a live session whose permissions still allow access. Responses are never cached publicly.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Sign in required", { status: 401 });
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!verifyFileToken(key, actor.id, exp, sig)) return new NextResponse("Link expired or invalid", { status: 403 });
  let meta: { mimeType: string; filename: string };
  try {
    meta = await authoriseFileKey(actor, key);
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const data = await getStorage().get(key).catch(() => null);
  if (!data) return new NextResponse("Not found", { status: 404 });
  await logAccess(actor, "file_download", "file", null, null, { key: key.split("/").slice(0, 4).join("/") });
  const download = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": meta.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(meta.filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": meta.mimeType === "application/pdf" ? "default-src 'none'; frame-ancestors 'self'" : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox",
    },
  });
}
