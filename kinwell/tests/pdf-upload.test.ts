import { beforeAll, describe, expect, it } from "vitest";
import { simplePdf, paginate, wrapLines } from "@/lib/utils/simple-pdf";
import { uploadReport, getReport } from "@/lib/services/reports";
import { uploadKnowledgeDocument, setKnowledgeStatus, searchDoctorKnowledge, getKnowledgeDocument } from "@/lib/services/knowledge";
import { createWorld, type TestWorld } from "./helpers";

let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});

describe("PDF uploads are parsed for real (text layer)", () => {
  it("extracts lab values from an uploaded PDF report", async () => {
    const pdf = simplePdf([["Sunrise Lab (fictional)", "Date: 12/09/2026", "HbA1c 7.0 % 4.0 - 5.6", "LDL Cholesterol 131 mg/dL < 100"]]);
    const id = await uploadReport(w.demo, { profileId: w.profiles.dad, file: { name: "lab.pdf", type: "application/pdf", size: pdf.length, buffer: pdf } });
    const { report, results, files } = await getReport(w.demo, id);
    expect(report.extraction?.isMock).toBe(false);
    expect(files.find((f) => f.variant === "original")?.mime_type).toBe("application/pdf");
    expect(results.find((r) => r.canonical_name === "HbA1c")?.value).toBe(7);
    expect(results.find((r) => r.canonical_name === "LDL cholesterol")?.flag).toBe("high");
  });
  it("indexes a doctor's guidance PDF and makes it searchable after approval", async () => {
    const text = "# Snacks guide\nHealthy snacks between meals\nChoose roasted chana, a small handful of nuts, buttermilk, or a guava instead of biscuits. Avoid fruit juice and pair fruit with nuts to slow the rise in blood sugar.";
    const pdf = simplePdf(paginate(wrapLines(text)));
    const id = await uploadKnowledgeDocument(w.doctor, { title: "Snacks guide", category: "Nutrition", file: { name: "snacks.pdf", type: "application/pdf", buffer: pdf } });
    const { doc, chunks } = await getKnowledgeDocument(w.doctor, id);
    expect(doc.status).toBe("ready_for_review");
    expect(chunks.length).toBeGreaterThan(0);
    expect(doc.parsed_content).toMatch(/roasted chana/);
    await setKnowledgeStatus(w.doctor, id, "approve");
    const hits = await searchDoctorKnowledge(w.doctor.doctorId, "what snacks are good for blood sugar");
    expect(hits.some((h) => h.document_id === id)).toBe(true);
  });
});
