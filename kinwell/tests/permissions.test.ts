import { beforeAll, describe, expect, it } from "vitest";
import { createWorld, type TestWorld } from "./helpers";
import { assertFamilyAccess, assertProfileAccess, ForbiddenError } from "@/lib/security/access";
import { getProfile } from "@/lib/services/profiles";
import { listReports, getReport } from "@/lib/services/reports";
import { listConversations } from "@/lib/services/conversations";
import { addMeasurement, listMeasurements } from "@/lib/services/health-record";
import { addInstruction } from "@/lib/services/doctor";
import { getDoctorFamily, listDoctorFamilies } from "@/lib/services/doctor";
import { listDoctorReviews } from "@/lib/services/reviews";

let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});

describe("family isolation (Patient A cannot access Patient B / Family A cannot access Family B)", () => {
  it("demo family cannot read the Rivera family's profile", async () => {
    await expect(getProfile(w.demo, w.profiles.carlos)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("Rivera cannot read Mom's measurements or write to her record", async () => {
    await expect(listMeasurements(w.rivera, w.profiles.mom)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addMeasurement(w.rivera, { profileId: w.profiles.mom, measurementType: "heart_rate", value: 70 })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("cannot list another family's reports or conversations", async () => {
    await expect(listReports(w.rivera, w.demo.familyId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listConversations(w.rivera, w.demo.familyId)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("cannot open another family's report by id", async () => {
    const r = (await w.db.query<{ id: string }>("select id from reports where family_id = $1 limit 1", [w.demo.familyId])).rows[0]!;
    await expect(getReport(w.rivera, r.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getReport(w.demo, r.id)).resolves.toBeTruthy();
  });
});

describe("doctor access is limited to assigned families", () => {
  it("assigned doctor can read the Jain family", async () => {
    await expect(assertFamilyAccess(w.doctor, w.demo.familyId)).resolves.toBeUndefined();
    const fams = await listDoctorFamilies(w.doctor);
    expect(fams.map((f) => f.id)).toEqual([w.demo.familyId]);
  });
  it("doctor cannot access an unassigned family", async () => {
    await expect(getDoctorFamily(w.doctor, w.rivera.familyId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertProfileAccess(w.doctor, w.profiles.carlos)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertProfileAccess(w.doctor2, w.profiles.mom)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("doctor reads but cannot write ordinary family records", async () => {
    await expect(listMeasurements(w.doctor, w.profiles.mom)).resolves.toBeInstanceOf(Array);
    await expect(addMeasurement(w.doctor, { profileId: w.profiles.mom, measurementType: "heart_rate", value: 70 })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("losing the assignment immediately removes access", async () => {
    await w.db.query("update doctor_family_assignments set status = 'ended' where family_id = $1", [w.demo.familyId]);
    await expect(assertProfileAccess(w.doctor, w.profiles.mom)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listDoctorReviews(w.doctor)).toHaveLength(0);
    await w.db.query("update doctor_family_assignments set status = 'active' where family_id = $1", [w.demo.familyId]);
  });
});

describe("role permissions are enforced server-side", () => {
  it("a patient cannot create doctor instructions", async () => {
    await expect(addInstruction(w.demo, { profileId: w.profiles.mom, instructionType: "general", instruction: "Take extra tablets" })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("a doctor cannot add instructions for an unassigned patient", async () => {
    await expect(addInstruction(w.doctor, { profileId: w.profiles.carlos, instructionType: "general", instruction: "Walk daily please" })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("an admin is not granted access to patient health data", async () => {
    await expect(getProfile(w.admin, w.profiles.mom)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("row level security (defence in depth for direct database clients)", () => {
  async function asUser(userId: string, sql: string, params: unknown[] = []) {
    return w.db.transaction(async (tx) => {
      await tx.exec("set local role app_user");
      await tx.query("select set_config('app.user_id', $1, true)", [userId]);
      return (await tx.query<Record<string, unknown>>(sql, params)).rows;
    });
  }
  it("a family member only sees their own family's rows", async () => {
    const profiles = await asUser(w.demo.id, "select family_id from profiles");
    expect(profiles.length).toBe(4); // Neerja, Mom, Dad and Bruno the dog
    expect(profiles.every((p) => p.family_id === w.demo.familyId)).toBe(true);
    const meas = await asUser(w.rivera.id, "select profile_id from measurements");
    expect(meas.every((m) => m.profile_id === w.profiles.carlos)).toBe(true);
  });
  it("the assigned doctor sees the family; an unassigned doctor sees nothing", async () => {
    expect((await asUser(w.doctor.id, "select id from reports")).length).toBeGreaterThan(0);
    expect((await asUser(w.doctor.id, "select id from profiles where family_id = $1", [w.rivera.familyId])).length).toBe(0);
    expect((await asUser(w.doctor2.id, "select id from reports where family_id = $1", [w.demo.familyId])).length).toBe(0);
  });
  it("anonymous connections see no health data", async () => {
    const rows = await w.db.transaction(async (tx) => {
      await tx.exec("set local role app_user");
      return (await tx.query("select id from measurements")).rows;
    });
    expect(rows).toHaveLength(0);
  });
});
