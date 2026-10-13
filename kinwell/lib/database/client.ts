import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Database access layer.
 *
 * - DATABASE_URL set  → node-postgres pool (Supabase, Neon, RDS, local Postgres …)
 * - DATABASE_URL unset → embedded PGlite (real Postgres compiled to WASM, with pgvector) stored in .data/pglite
 *
 * Both expose the same tiny interface so services never care which engine is running.
 */
export interface QueryResult<T> {
  rows: T[];
}

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  readonly engine: "postgres" | "pglite";
}

type GlobalDb = { __kinwellDb?: Promise<Db>; __kinwellDbReady?: Promise<void> };
const g = globalThis as unknown as GlobalDb;

function numericParsers() {
  return {
    1700: (v: string) => (v === null ? null : parseFloat(v)), // numeric
    20: (v: string) => (v === null ? null : Number(v)), // int8 / count(*)
    1082: (v: string) => v, // date stays an ISO yyyy-mm-dd string
  } as const;
}

async function createPostgres(url: string): Promise<Db> {
  const pg = await import("pg");
  const Pool = pg.default?.Pool ?? pg.Pool;
  const types = pg.default?.types ?? pg.types;
  for (const [oid, fn] of Object.entries(numericParsers())) types.setTypeParser(Number(oid), fn as (v: string) => unknown);
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    ssl: process.env.DATABASE_SSL === "false" ? undefined : url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  const wrap = (runner: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Db => ({
    engine: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await runner.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      await runner.query(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn(wrap(client));
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
    },
  });
  return wrap(pool);
}

function acquireLock(dataDir: string) {
  const lockFile = path.join(dataDir, "kinwell.lock");
  if (fs.existsSync(lockFile)) {
    const pid = Number(fs.readFileSync(lockFile, "utf8"));
    let alive = false;
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      throw new Error(
        `The embedded database at ${dataDir} is in use by another process (pid ${pid}). Stop the dev server before running db scripts.`,
      );
    }
  }
  fs.writeFileSync(lockFile, String(process.pid));
  const release = () => {
    try {
      if (fs.readFileSync(lockFile, "utf8") === String(process.pid)) fs.unlinkSync(lockFile);
    } catch {
      /* ignore */
    }
  };
  process.once("exit", release);
}

export async function createPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const dir = dataDir ?? process.env.PGLITE_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "pglite");
  const inMemory = dir.startsWith("memory://");
  if (!inMemory) {
    fs.mkdirSync(dir, { recursive: true });
    acquireLock(dir);
  }
  const db = await PGlite.create({
    dataDir: inMemory ? undefined : dir,
    extensions: { vector },
    parsers: numericParsers() as never,
  });
  type Runner = { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (s: string) => Promise<unknown> };
  const wrap = (runner: Runner, root: boolean): Db => ({
    engine: "pglite",
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await runner.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      await runner.exec(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      if (!root) return fn(wrap(runner, false));
      return db.transaction(async (tx) => fn(wrap(tx as unknown as Runner, false)));
    },
  });
  return wrap(db as unknown as Runner, true);
}

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  return url ? createPostgres(url) : createPglite();
}

/** Returns the shared database connection, running migrations (and demo seeding in development) on first use. */
export async function getDb(): Promise<Db> {
  if (!g.__kinwellDb) {
    g.__kinwellDb = createDb();
    g.__kinwellDbReady = g.__kinwellDb.then(async (db) => {
      const { runMigrations } = await import("./migrate");
      await runMigrations(db);
      if (process.env.AUTO_SEED_DEMO !== "false" && process.env.NODE_ENV !== "test") {
        const { seedIfEmpty } = await import("../../database/seeds/seed");
        await seedIfEmpty(db);
      }
    });
  }
  const db = await g.__kinwellDb;
  await g.__kinwellDbReady;
  return db;
}

/** Test helper: inject a database (e.g. in-memory PGlite). */
export function __setDbForTests(db: Db) {
  g.__kinwellDb = Promise.resolve(db);
  g.__kinwellDbReady = Promise.resolve();
}
