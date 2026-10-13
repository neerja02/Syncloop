import { NextResponse } from "next/server";
import { getActor } from "@/lib/security/session";
import { exportFamilyData } from "@/lib/services/privacy";

export async function GET() {
  const actor = await getActor();
  if (!actor) return new NextResponse("Sign in required", { status: 401 });
  try {
    const data = await exportFamilyData(actor);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="kinwell-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Export failed", { status: 400 });
  }
}
