import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { signFileToken, verifyFileToken, getStorage } from "@/lib/integrations/storage";
import { authoriseFileKey, uploadReport } from "@/lib/services/reports";
import { deleteProfile } from "@/lib/services/profiles";
import { ForbiddenError } from "@/lib/security/access";
import { createConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import { createReview } from "@/lib/services/reviews";
import { count, createWorld, type TestWorld } from "./helpers";

let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});

describe("private file access", () => {
  it("signed URLs expire and are bound to the user", () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signFileToken("families/x/reports/y/original.pdf", "user-a", exp);
    expect(verifyFileToken("families/x/reports/y/original.pdf", "user-a", exp, sig)).toBe(true);
    expect(verifyFileToken("families/x/reports/y/original.pdf", "user-b", exp, sig)).toBe(false);
    expect(verifyFileToken("families/x/reports/z/original.pdf", "user-a", exp, sig)).toBe(false);
    expect(verifyFileToken("families/x/reports/y/original.pdf", "user-a", exp - 3600, sig)).toBe(false);
  });
  it("signed URLs point at the authorised endpoint, never a public path", async () => {
    const url = await getStorage().signedUrl("families/a/reports/b/original.pdf", { userId: "u" });
    expect(url.startsWith("/api/files?")).toBe(true);
  });
  it("file keys are re-authorised against permissions on every access", async () => {
    const key = (await w.db.query<{ storage_key: string }>("select f.storage_key from report_files f join reports r on r.id = f.report_id where r.family_id = $1 limit 1", [w.demo.familyId])).rows[0]!.storage_key;
    await expect(authoriseFileKey(w.demo, key)).resolves.toBeTruthy();
    await expect(authoriseFileKey(w.rivera, key)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(authoriseFileKey(w.doctor2, key)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("profile deletion", () => {
  it("removes every health row and stored file for the profile (no orphans)", async () => {
    const pid = w.profiles.dad;
    const id = await uploadReport(w.demo, { profileId: pid, file: { name: "x.txt", type: "text/plain", size: 30, buffer: Buffer.from("Lab\nHbA1c 6.1 % 4.0 - 5.6") } });
    const conv = await createConversation(w.demo, pid);
    await handleUserMessage(w.demo, conv, "My blood pressure is 140/90");
    await createReview(w.demo, { profileId: pid, question: "Please check my readings" });
    const key = (await w.db.query<{ storage_key: string }>("select storage_key from report_files where report_id = $1", [id])).rows[0]!.storage_key;
    const file = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR!, key);
    expect(fs.existsSync(file)).toBe(true);

    await deleteProfile(w.demo, pid);

    const tables = ["measurements", "medications", "health_conditions", "allergies", "reports", "report_results", "doctor_patient_instructions", "doctor_notes", "doctor_reviews", "appointments", "symptoms", "health_goals", "check_ins", "emergency_contacts", "messages", "agent_audit_logs"];
    for (const t of tables) expect(await count(w.db, `select count(*) as n from ${t} where profile_id = $1`, [pid])).toBe(0);
    expect(await count(w.db, "select count(*) as n from conversations where active_profile_id = $1", [pid])).toBe(0);
    expect(await count(w.db, "select count(*) as n from report_files where report_id = $1", [id])).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
  });
  it("other families cannot delete a profile", async () => {
    await expect(deleteProfile(w.rivera, w.profiles.mom)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
