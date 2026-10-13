import fs from "node:fs";
import path from "node:path";
import type { Db } from "./client";
import { syncKnowledge } from "@/lib/clinical/knowledge/sync";

const MIGRATIONS_DIR = path.join(process.cwd(), "database", "migrations");

/** Applies every .sql file in database/migrations exactly once, in filename order. */
export async function runMigrations(db: Db, log: (m: string) => void = () => {}) {
  await db.exec(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into schema_migrations(name) values ($1)", [file]);
    });
    log(`applied ${file}`);
  }
  // Health knowledge content lives in code and is synced (versioned, review status reset on change).
  await syncKnowledge(db);
}
