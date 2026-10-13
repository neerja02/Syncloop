import { __setDbForTests, createPglite, type Db } from "@/lib/database/client";
import { runMigrations } from "@/lib/database/migrate";
import { seedDemo } from "@/database/seeds/seed";
import { loadActor, toSessionUser, type UserRow } from "@/lib/security/actor";
import { clearRulesCache } from "@/lib/clinical/rules-repo";
import type { Actor } from "@/types/domain";

export interface TestWorld {
  db: Db;
  demo: Actor & { familyId: string };
  rivera: Actor & { familyId: string };
  doctor: Actor & { doctorId: string };
  doctor2: Actor & { doctorId: string };
  admin: Actor;
  profiles: { me: string; mom: string; dad: string; carlos: string };
}

export async function createWorld(): Promise<TestWorld> {
  const db = await createPglite("memory://");
  await runMigrations(db);
  __setDbForTests(db);
  clearRulesCache();
  await seedDemo(db);
  const actor = async (email: string) => loadActor(toSessionUser((await db.query<UserRow>("select * from users where email = $1", [email])).rows[0]!));
  const demo = (await actor("demo@kinwell.health")) as TestWorld["demo"];
  const rivera = (await actor("rivera@kinwell.health")) as TestWorld["rivera"];
  const doctor = (await actor("doctor@kinwell.health")) as TestWorld["doctor"];
  const doctor2 = (await actor("doctor2@kinwell.health")) as TestWorld["doctor2"];
  const admin = await actor("admin@kinwell.health");
  const pid = async (familyId: string, rel: string) => (await db.query<{ id: string }>("select id from profiles where family_id = $1 and relationship = $2", [familyId, rel])).rows[0]!.id;
  return {
    db,
    demo,
    rivera,
    doctor,
    doctor2,
    admin,
    profiles: { me: await pid(demo.familyId, "self"), mom: await pid(demo.familyId, "mother"), dad: await pid(demo.familyId, "father"), carlos: await pid(rivera.familyId, "self") },
  };
}

export async function count(db: Db, sql: string, params: unknown[] = []) {
  return Number((await db.query<{ n: number }>(sql, params)).rows[0]!.n);
}
