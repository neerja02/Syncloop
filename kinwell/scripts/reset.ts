import fs from "node:fs";
import path from "node:path";

/** Deletes the local embedded database + local file storage, then re-migrates and re-seeds demo data. */
if (process.env.DATABASE_URL) {
  console.error("db:reset only resets the embedded development database. For Postgres/Supabase, reset via your provider (e.g. `supabase db reset`).");
  process.exit(1);
}
const data = path.join(process.cwd(), ".data");
const lock = path.join(data, "pglite", "kinwell.lock");
if (fs.existsSync(lock)) {
  const pid = Number(fs.readFileSync(lock, "utf8"));
  try {
    process.kill(pid, 0);
    console.error(`The dev server (pid ${pid}) is using the database. Stop it first, then run npm run db:reset.`);
    process.exit(1);
  } catch {
    /* stale lock */
  }
}
fs.rmSync(path.join(data, "pglite"), { recursive: true, force: true });
fs.rmSync(path.join(data, "storage"), { recursive: true, force: true });
console.log("Removed .data/pglite and .data/storage");
await import("./seed");
