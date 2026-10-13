import { beforeAll, describe, expect, it } from "vitest";
import { uploadReport, getReport, enterResultManually, confirmResult } from "@/lib/services/reports";
import { extractStructuredFields } from "@/lib/clinical/report-extraction";
import { LocalMedicationTerminologyProvider } from "@/lib/integrations/terminology/medication";
import { decideConfidence, CONFIDENCE_THRESHOLDS } from "@/lib/config/confidence";
import { ForbiddenError } from "@/lib/security/access";
import { count, createWorld, type TestWorld } from "./helpers";

let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});

const LAB = `CityCare Diagnostics
Date: 25/09/2026
HbA1c 6.9 % 4.0 - 5.6
Fasting Blood Glucose 126 mg/dL 70 - 99
Haemoglobin 13.4 g/dL 12.0 - 15.5`;

const file = (text: string, name = "lab.txt") => ({ name, type: "text/plain", size: Buffer.byteLength(text), buffer: Buffer.from(text) });

describe("report assignment & processing", () => {
  it("associates the report and every extracted value with the chosen profile", async () => {
    const id = await uploadReport(w.demo, { profileId: w.profiles.mom, file: file(LAB) });
    const { report, results } = await getReport(w.demo, id);
    expect(report.profile_id).toBe(w.profiles.mom);
    expect(report.status).toBe("processed");
    expect(report.report_date).toBe("2026-09-25");
    expect(results.map((r) => r.canonical_name)).toEqual(expect.arrayContaining(["HbA1c", "Fasting blood glucose", "Haemoglobin"]));
    expect(results.every((r) => r.status === "confirmed")).toBe(true);
    expect(await count(w.db, "select count(*) as n from report_results where report_id = $1 and profile_id <> $2", [id, w.profiles.mom])).toBe(0);
    // confirmed HbA1c becomes a trend measurement for Mom
    expect(await count(w.db, "select count(*) as n from measurements where report_id = $1 and profile_id = $2 and measurement_type = 'hba1c'", [id, w.profiles.mom])).toBe(1);
  });
  it("auto-files a lab report with HbA1c into the Diabetes folder", async () => {
    const id = await uploadReport(w.demo, { profileId: w.profiles.dad, file: file(LAB) });
    const { report } = await getReport(w.demo, id);
    expect(report.folder_name).toBe("Diabetes");
  });
  it("refuses uploads to another family's profile or folder", async () => {
    await expect(uploadReport(w.rivera, { profileId: w.profiles.mom, file: file(LAB) })).rejects.toBeInstanceOf(ForbiddenError);
    const folder = (await w.db.query<{ id: string }>("select id from report_folders where family_id = $1 limit 1", [w.demo.familyId])).rows[0]!.id;
    await expect(uploadReport(w.rivera, { profileId: w.profiles.carlos, folderId: folder, file: file(LAB) })).rejects.toThrow();
  });
  it("rejects files whose content doesn't match an allowed type", async () => {
    await expect(uploadReport(w.demo, { profileId: w.profiles.me, file: { name: "x.pdf", type: "application/pdf", size: 4, buffer: Buffer.from([0, 1, 2, 3]) } })).rejects.toThrow(/Unsupported/);
  });
});

describe("OCR confidence handling — unreadable values are never guessed", () => {
  it("stores a smudged HbA1c as unreadable with no numeric value", async () => {
    const id = await uploadReport(w.demo, { profileId: w.profiles.me, file: file("Lab\nHbA1c 7.? % 4.0 - 5.6\nFasting Blood Glucose 118 mg/dL 70 - 99") });
    const { report, results } = await getReport(w.demo, id);
    const hb = results.find((r) => r.canonical_name === "HbA1c")!;
    expect(hb.value).toBeNull();
    expect(hb.status).toBe("unreadable");
    expect(hb.value_text).toBe("7.?");
    expect(report.status).toBe("needs_confirmation");
    expect(report.summary).toMatch(/not guessed/);
    await expect(confirmResult(w.demo, hb.id)).rejects.toThrow(/enter it manually/);
    await enterResultManually(w.demo, hb.id, 7.4);
    const after = await getReport(w.demo, id);
    expect(after.results.find((r) => r.id === hb.id)!.value).toBe(7.4);
  });
  it("low-confidence lines require confirmation", async () => {
    const res = await extractStructuredFields([{ text: "Fasting Blood Glucose 126 mg/dL 70 - 99", confidence: 0.8, page: 1 }], new LocalMedicationTerminologyProvider());
    expect(res.fields[0]!.value).toBe(126);
    expect(res.fields[0]!.status).toBe("needs_confirmation");
  });
  it("medication names on prescriptions need confirmation when uncertain", async () => {
    const res = await extractStructuredFields([{ text: "Tab Metfornin 500 mg twice daily", confidence: 0.99, page: 1 }], new LocalMedicationTerminologyProvider());
    const f = res.fields[0]!;
    expect(f.field_type).toBe("medication");
    expect(f.canonical_name).toBe("Metformin");
    expect(f.status).toBe("needs_confirmation");
  });
  it("thresholds are centrally configured and stricter for clinical fields", () => {
    expect(CONFIDENCE_THRESHOLDS.lab_value.autoAccept).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLDS.text.autoAccept);
    expect(decideConfidence("lab_value", 0.99)).toBe("accept");
    expect(decideConfidence("lab_value", 0.8)).toBe("confirm");
    expect(decideConfidence("lab_value", 0.3)).toBe("reject");
  });
});
