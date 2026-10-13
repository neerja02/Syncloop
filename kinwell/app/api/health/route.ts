import { NextResponse } from "next/server";
import { getDb } from "@/lib/database/client";

export async function GET() {
  try {
    const db = await getDb();
    await db.query("select 1");
    return NextResponse.json({ status: "ok", database: db.engine });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
