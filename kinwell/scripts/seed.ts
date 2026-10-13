import { runMigrations } from "@/lib/database/migrate";
import { seedDemo } from "@/database/seeds/seed";
import { openDb } from "./migrate";

const db = await openDb();
await runMigrations(db);
const existing = (await db.query<{ n: number }>("select count(*) as n from users")).rows[0]!.n;
if (existing > 0 && !process.argv.includes("--force")) {
  console.log("Database already has data. Use `npm run db:reset` for a clean demo database.");
  process.exit(0);
}
await seedDemo(db, (m) => console.log("✓ seeded", m));
console.log("\nDemo data ready. Sign in with demo@kinwell.health / Demo@1234.");
process.exit(0);
