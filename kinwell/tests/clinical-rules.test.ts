import { describe, expect, it } from "vitest";
import { latestActive, selectMeasurementRule, type ClinicalRule } from "@/lib/clinical/rules";
import { SEED_RULES } from "@/database/seeds/clinical-rules";

const rules: ClinicalRule[] = SEED_RULES.map((r, i) => ({
  id: String(i),
  rule_key: r.rule_key,
  rule_kind: r.rule_kind,
  condition: r.condition ?? null,
  measurement_type: r.measurement_type ?? null,
  context: r.context ?? null,
  age_min: r.age_min ?? null,
  age_max: r.age_max ?? null,
  sex: null,
  pregnancy_status: null,
  diagnosis_status: r.diagnosis_status ?? "any",
  unit: r.unit ?? null,
  min_value: r.min_value ?? null,
  max_value: r.max_value ?? null,
  secondary_min: r.secondary_min ?? null,
  secondary_max: r.secondary_max ?? null,
  pattern: (r.pattern as ClinicalRule["pattern"]) ?? null,
  severity: r.severity,
  status_label: r.status_label,
  recommended_action: r.recommended_action,
  jurisdiction: "GLOBAL",
  source: r.source,
  version: 1,
  priority: 100,
  reviewed_by: null,
  reviewed_at: null,
  active: true,
}));

describe("clinical rule selection", () => {
  it("fasting glucose for someone without diabetes", () => {
    expect(selectMeasurementRule(rules, { type: "blood_glucose", value: 92, context: "fasting", diagnosed: false })?.rule_key).toBe("glucose.fasting.typical");
    expect(selectMeasurementRule(rules, { type: "blood_glucose", value: 110, context: "fasting", diagnosed: false })?.rule_key).toBe("glucose.fasting.elevated");
  });
  it("uses diabetes-specific targets when diagnosed", () => {
    expect(selectMeasurementRule(rules, { type: "blood_glucose", value: 120, context: "fasting", diagnosed: true })?.rule_key).toBe("glucose.fasting.dm.target");
    expect(selectMeasurementRule(rules, { type: "blood_glucose", value: 184, context: "after_meal", diagnosed: true })?.rule_key).toBe("glucose.post.dm.above");
  });
  it("very low glucose matches regardless of context", () => {
    expect(selectMeasurementRule(rules, { type: "blood_glucose", value: 48, context: "after_meal", diagnosed: true })?.severity).toBe("HIGH");
  });
  it("blood pressure uses either-value logic and the most severe category", () => {
    expect(selectMeasurementRule(rules, { type: "blood_pressure", value: 115, secondaryValue: 75 })?.rule_key).toBe("bp.normal");
    expect(selectMeasurementRule(rules, { type: "blood_pressure", value: 115, secondaryValue: 85 })?.rule_key).toBe("bp.stage1");
    expect(selectMeasurementRule(rules, { type: "blood_pressure", value: 150, secondaryValue: 95 })?.rule_key).toBe("bp.stage2");
    expect(selectMeasurementRule(rules, { type: "blood_pressure", value: 185, secondaryValue: 100 })?.rule_key).toBe("bp.severe");
  });
  it("only the newest active version of a rule is used", () => {
    const v2 = { ...rules.find((r) => r.rule_key === "bp.stage2")!, id: "v2", version: 2, status_label: "Stage 2 (v2)" };
    const set = latestActive([...rules, v2]);
    expect(set.filter((r) => r.rule_key === "bp.stage2")).toHaveLength(1);
    expect(selectMeasurementRule([...rules, v2], { type: "blood_pressure", value: 150, secondaryValue: 95 })?.status_label).toBe("Stage 2 (v2)");
    const inactive = { ...v2, active: false };
    expect(selectMeasurementRule([...rules, inactive], { type: "blood_pressure", value: 150, secondaryValue: 95 })?.version).toBe(1);
  });
  it("jurisdiction-specific rules win over GLOBAL ones", () => {
    const local = { ...rules.find((r) => r.rule_key === "glucose.random.elevated")!, id: "in", rule_key: "glucose.random.elevated.in", jurisdiction: "IN", status_label: "IN-specific" };
    expect(selectMeasurementRule([...rules, local], { type: "blood_glucose", value: 150, context: "random", jurisdiction: "IN" })?.status_label).toBe("IN-specific");
    expect(selectMeasurementRule([...rules, local], { type: "blood_glucose", value: 150, context: "random", jurisdiction: "GB" })?.status_label).not.toBe("IN-specific");
  });
});
