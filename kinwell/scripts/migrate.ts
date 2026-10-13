import { createPglite, type Db } from "@/lib/database/client";
import { runMigrations } from "@/lib/database/migrate";

export async function openDb(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false } });
    const db: Db = {
      engine: "postgres",
      query: async (s, p) => ({ rows: (await pool.query(s, p as unknown[])).rows }),
      exec: async (s) => void (await pool.query(s)),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("begin");
          const r = await fn({ engine: "postgres", query: async (s, p) => ({ rows: (await c.query(s, p as unknown[])).rows }), exec: async (s) => void (await c.query(s)), transaction: (f) => f(db) } as Db);
          await c.query("commit");
          return r;
        } catch (e) {
          await c.query("rollback");
          throw e;
        } finally {
          c.release();
        }
      },
    };
    return db;
  }
  return createPglite();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = await openDb();
  await runMigrations(db, (m) => console.log("✓", m));
  console.log("Migrations complete.");
  process.exit(0);
}
