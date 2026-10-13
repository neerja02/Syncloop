import { decideConfidence } from "@/lib/config/confidence";
import type { RecognizedLine } from "@/lib/integrations/ocr";
import type { MedicationTerminologyProvider } from "@/lib/integrations/terminology/medication";
import { similarity } from "@/lib/utils/text";

/** Reference catalogue of lab tests we can recognise. Explanations are general education, not interpretation. */
export interface LabTest {
  canonical: string;
  aliases: string[];
  unit: string;
  measures: string;
  measurementType?: "hba1c" | "blood_glucose";
  glucoseContext?: "fasting" | "after_meal" | "random";
}

export const LAB_TESTS: LabTest[] = [
  { canonical: "HbA1c", aliases: ["hba1c", "a1c", "glycated haemoglobin", "glycated hemoglobin", "glycosylated haemoglobin", "hemoglobin a1c"], unit: "%", measures: "Your average blood sugar over roughly the past 2–3 months.", measurementType: "hba1c" },
  { canonical: "Fasting blood glucose", aliases: ["fasting blood glucose", "fasting glucose", "fbs", "fasting blood sugar", "glucose fasting", "fpg"], unit: "mg/dL", measures: "Blood sugar after not eating for at least 8 hours.", measurementType: "blood_glucose", glucoseContext: "fasting" },
  { canonical: "Post-meal blood glucose", aliases: ["postprandial blood glucose", "ppbs", "post prandial", "pp glucose", "2 hr glucose", "glucose pp"], unit: "mg/dL", measures: "Blood sugar about two hours after a meal.", measurementType: "blood_glucose", glucoseContext: "after_meal" },
  { canonical: "Random blood glucose", aliases: ["random blood glucose", "rbs", "random glucose", "random blood sugar"], unit: "mg/dL", measures: "Blood sugar at any time of day.", measurementType: "blood_glucose", glucoseContext: "random" },
  { canonical: "Haemoglobin", aliases: ["haemoglobin", "hemoglobin", "hb", "hgb"], unit: "g/dL", measures: "The oxygen-carrying protein in red blood cells." },
  { canonical: "White blood cells", aliases: ["wbc", "total leucocyte count", "tlc", "white blood cells", "leukocytes"], unit: "×10³/µL", measures: "Cells that help fight infection." },
  { canonical: "Platelets", aliases: ["platelets", "platelet count", "plt"], unit: "×10³/µL", measures: "Cells that help blood clot." },
  { canonical: "Total cholesterol", aliases: ["total cholesterol", "cholesterol total", "serum cholesterol", "cholesterol"], unit: "mg/dL", measures: "The overall amount of cholesterol in your blood." },
  { canonical: "LDL cholesterol", aliases: ["ldl cholesterol", "ldl", "ldl-c", "low density lipoprotein"], unit: "mg/dL", measures: "Often called 'bad' cholesterol; higher levels can build up in arteries." },
  { canonical: "HDL cholesterol", aliases: ["hdl cholesterol", "hdl", "hdl-c", "high density lipoprotein"], unit: "mg/dL", measures: "Often called 'good' cholesterol; it helps remove other cholesterol." },
  { canonical: "Triglycerides", aliases: ["triglycerides", "tg", "triglyceride"], unit: "mg/dL", measures: "A type of fat in the blood, affected by diet and activity." },
  { canonical: "Creatinine", aliases: ["creatinine", "serum creatinine", "s. creatinine"], unit: "mg/dL", measures: "A waste product used to check how well the kidneys filter blood." },
  { canonical: "eGFR", aliases: ["egfr", "estimated gfr", "glomerular filtration rate"], unit: "mL/min/1.73m²", measures: "An estimate of kidney filtering function." },
  { canonical: "TSH", aliases: ["tsh", "thyroid stimulating hormone"], unit: "mIU/L", measures: "A hormone used to check thyroid function." },
  { canonical: "Vitamin D", aliases: ["vitamin d", "25-oh vitamin d", "25 hydroxy vitamin d", "vit d"], unit: "ng/mL", measures: "Vitamin D level, important for bones and muscles." },
  { canonical: "Vitamin B12", aliases: ["vitamin b12", "b12", "cobalamin"], unit: "pg/mL", measures: "Vitamin B12 level, important for nerves and blood cells." },
  { canonical: "ALT (SGPT)", aliases: ["alt", "sgpt", "alanine aminotransferase"], unit: "U/L", measures: "A liver enzyme." },
  { canonical: "AST (SGOT)", aliases: ["ast", "sgot", "aspartate aminotransferase"], unit: "U/L", measures: "An enzyme found in the liver and muscles." },
  { canonical: "Uric acid", aliases: ["uric acid", "serum uric acid"], unit: "mg/dL", measures: "A waste product; high levels can be linked to gout." },
  { canonical: "Potassium", aliases: ["potassium", "k+", "serum potassium"], unit: "mmol/L", measures: "An electrolyte important for heart and muscle function." },
  { canonical: "Sodium", aliases: ["sodium", "na+", "serum sodium"], unit: "mmol/L", measures: "An electrolyte that helps balance fluids." },
];

export interface ExtractedField {
  test_name: string;
  canonical_name: string | null;
  value: number | null;
  value_text: string;
  unit: string | null;
  reference_range: string | null;
  flag: "low" | "normal" | "high" | null;
  confidence: number;
  page_number: number;
  bounding_box: RecognizedLine["boundingBox"] | null;
  raw_text: string;
  normalised_text: string;
  field_type: "lab_value" | "medication" | "date";
  status: "confirmed" | "needs_confirmation" | "unreadable";
  medication?: { canonical: string | null; confidence: number; strength: string | null; alternatives: string[] };
  note?: string;
}

export interface ExtractionResult {
  documentType: { type: string; confidence: number };
  reportDate: { value: string | null; confidence: number; raw: string | null };
  labName: string | null;
  fields: ExtractedField[];
  unreadableCount: number;
  needsConfirmationCount: number;
}

const NUMBER = /^[<>≤≥]?\s*\d+(?:[.,]\d+)?$/;

function matchTest(label: string): { test: LabTest; score: number } | null {
  const l = label.toLowerCase().replace(/[:.]+$/, "").trim();
  let best: { test: LabTest; score: number } | null = null;
  for (const t of LAB_TESTS) {
    for (const a of t.aliases) {
      const s = l === a ? 1 : l.includes(a) && a.length >= 3 ? 0.97 : similarity(l, a);
      if (!best || s > best.score) best = { test: t, score: s };
    }
  }
  return best && best.score >= 0.82 ? best : null;
}

function parseRange(text: string): { low: number | null; high: number | null; raw: string } | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (m) return { low: Number(m[1]), high: Number(m[2]), raw: `${m[1]} – ${m[2]}` };
  const lt = text.match(/<\s*(\d+(?:\.\d+)?)/);
  if (lt) return { low: null, high: Number(lt[1]), raw: `< ${lt[1]}` };
  const gt = text.match(/>\s*(\d+(?:\.\d+)?)/);
  if (gt) return { low: Number(gt[1]), high: null, raw: `> ${gt[1]}` };
  return null;
}

export function detectDocumentType(text: string): { type: string; confidence: number } {
  const t = text.toLowerCase();
  const score = (words: string[]) => words.filter((w) => t.includes(w)).length;
  const scores: [string, number][] = [
    ["prescription", score(["rx", "tab ", "cap ", "prescription", "twice daily", "once daily", "after meals", "syp"])],
    ["blood_test", score(["haemoglobin", "hemoglobin", "glucose", "cholesterol", "reference range", "creatinine", "platelet", "hba1c", "diagnostics", "pathology"])],
    ["imaging", score(["x-ray", "xray", "ultrasound", "mri", "ct scan", "impression:", "radiology", "sonography"])],
    ["discharge_summary", score(["discharge", "admitted", "admission", "hospital course"])],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const [type, s] = scores[0]!;
  if (s === 0) return { type: "other", confidence: 0.3 };
  return { type, confidence: Math.min(0.98, 0.5 + s * 0.12) };
}

export function extractReportDate(text: string): { value: string | null; confidence: number; raw: string | null } {
  const m = text.match(/(?:date|collected|reported|sample)[^\d]{0,20}(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i) ?? text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (!m) return { value: null, confidence: 0, raw: null };
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return { value: null, confidence: 0.2, raw: m[0] };
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // dd/mm/yyyy is assumed (Indian/European convention) — ambiguous when both parts ≤ 12, so confidence is lower.
  return { value: iso, confidence: d <= 12 && mo <= 12 && d !== mo ? 0.75 : 0.95, raw: m[0] };
}

/**
 * Turns recognised lines into structured fields.
 * Critical rule: a value is only stored as a number when every character was read. Anything uncertain
 * (e.g. "7.?") is stored with value = null and status 'unreadable' — the missing digit is NEVER guessed.
 */
export async function extractStructuredFields(lines: RecognizedLine[], medTerminology: MedicationTerminologyProvider): Promise<ExtractionResult> {
  const fullText = lines.map((l) => l.text).join("\n");
  const fields: ExtractedField[] = [];
  for (const line of lines) {
    const text = line.text.trim();

    // Medication lines: "Tab Metfornin 500 mg twice daily"
    const med = text.match(/^(?:tab|tablet|cap|capsule|syp|syrup|inj|injection)\.?\s+([A-Za-z][A-Za-z0-9\- ]*?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units))?(.*)$/i);
    if (med) {
      const rawName = med[1]!.trim();
      const norm = await medTerminology.normalise(`${rawName} ${med[2] ?? ""}`);
      const decision = decideConfidence("medication_name", Math.min(norm.confidence, line.confidence));
      fields.push({
        test_name: rawName,
        canonical_name: norm.canonical_name,
        value: null,
        value_text: `${rawName}${med[2] ? " " + med[2] : ""}${med[3] ? " " + med[3].trim() : ""}`,
        unit: null,
        reference_range: null,
        flag: null,
        confidence: Math.min(norm.confidence, line.confidence),
        page_number: line.page,
        bounding_box: line.boundingBox ?? null,
        raw_text: text,
        normalised_text: norm.canonical_name ? text.replace(rawName, norm.canonical_name) : text,
        field_type: "medication",
        status: decision === "accept" ? "confirmed" : decision === "confirm" ? "needs_confirmation" : "unreadable",
        medication: { canonical: norm.canonical_name, confidence: norm.confidence, strength: norm.strength, alternatives: norm.possible_matches.slice(1).map((p) => p.canonical_name) },
      });
      continue;
    }

    // Lab lines: "<label> <value> <unit> <range>"
    const lab = text.match(/^([A-Za-z][A-Za-z0-9 ().\-/]*?)[\s:]+([<>≤≥]?\s*[\d?□�][\d.,?□�]*)\s*([a-zA-Z%µ/³×^0-9.]*(?:\/[a-zA-Z0-9.]+)?)?\s*(.*)$/);
    if (!lab) continue;
    const match = matchTest(lab[1]!);
    if (!match) continue;
    const rawValue = lab[2]!.replace(/\s+/g, "");
    const unit = lab[3] && !/^\d/.test(lab[3]) ? lab[3] : match.test.unit;
    const range = parseRange(lab[4] ?? "");
    const fullyRead = NUMBER.test(rawValue) && !/[?□�]/.test(rawValue);
    const confidence = Math.min(line.confidence, match.score) * (fullyRead ? 1 : 0.4);
    const value = fullyRead ? Number(rawValue.replace(/[<>≤≥\s]/g, "").replace(",", ".")) : null;
    const decision = fullyRead ? decideConfidence("lab_value", confidence) : "reject";
    let flag: ExtractedField["flag"] = null;
    if (value != null && range) {
      if (range.low != null && value < range.low) flag = "low";
      else if (range.high != null && value > range.high) flag = "high";
      else flag = "normal";
    }
    fields.push({
      test_name: lab[1]!.trim(),
      canonical_name: match.test.canonical,
      value,
      value_text: rawValue,
      unit,
      reference_range: range?.raw ?? null,
      flag,
      confidence: Math.round(confidence * 100) / 100,
      page_number: line.page,
      bounding_box: line.boundingBox ?? null,
      raw_text: text,
      normalised_text: `${match.test.canonical} ${value ?? "[unreadable]"} ${unit}`,
      field_type: "lab_value",
      status: decision === "accept" ? "confirmed" : decision === "confirm" ? "needs_confirmation" : "unreadable",
      note: fullyRead ? undefined : `We couldn't reliably read the complete ${match.test.canonical} value.`,
    });
  }
  const labName = lines.find((l) => /diagnostic|laborator|lab|patholog|clinic|hospital/i.test(l.text))?.text.replace(/\(demo\)/i, "").trim() ?? null;
  return {
    documentType: detectDocumentType(fullText),
    reportDate: extractReportDate(fullText),
    labName,
    fields,
    unreadableCount: fields.filter((f) => f.status === "unreadable").length,
    needsConfirmationCount: fields.filter((f) => f.status === "needs_confirmation").length,
  };
}

export function labTestInfo(canonical: string | null) {
  return LAB_TESTS.find((t) => t.canonical === canonical) ?? null;
}

export type TrendDirection = "improving" | "worsening" | "stable" | "insufficient";

/** Direction of change for tests where "lower is better" is a widely accepted general rule. Others are reported neutrally. */
export function trendDirection(canonical: string, values: number[]): { direction: TrendDirection; label: string } {
  if (values.length < 2) return { direction: "insufficient", label: "Not enough results to show a trend" };
  const [latest, previous] = values as [number, number];
  const delta = latest - previous;
  const rel = Math.abs(delta) / Math.max(Math.abs(previous), 1e-6);
  if (rel < 0.03) return { direction: "stable", label: "About the same as last time" };
  const lowerIsBetter = ["HbA1c", "Fasting blood glucose", "Post-meal blood glucose", "Random blood glucose", "LDL cholesterol", "Total cholesterol", "Triglycerides"];
  if (lowerIsBetter.includes(canonical)) return delta < 0 ? { direction: "improving", label: "Lower than last time" } : { direction: "worsening", label: "Higher than last time" };
  return { direction: "stable", label: delta < 0 ? "Lower than last time" : "Higher than last time" };
}
