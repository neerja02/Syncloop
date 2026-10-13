import type { Urgency } from "@/types/domain";

/** A versioned, clinician-configurable rule. Thresholds live in the database — never in prompts or UI code. */
export interface ClinicalRule {
  id: string;
  rule_key: string;
  rule_kind: "measurement_threshold" | "triage_pattern";
  condition: string | null;
  measurement_type: string | null;
  context: string | null;
  age_min: number | null;
  age_max: number | null;
  sex: string | null;
  pregnancy_status: string | null;
  diagnosis_status: "any" | "diagnosed" | "not_diagnosed" | null;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  secondary_min: number | null;
  secondary_max: number | null;
  pattern: TriagePattern | null;
  severity: Urgency;
  status_label: string;
  recommended_action: string;
  jurisdiction: string;
  source: string;
  version: number;
  priority: number;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  active: boolean;
}

export interface TriagePattern {
  all?: string[];
  any?: string[];
  measurement?: { type: string; minSeverity: Urgency };
  crisis?: boolean;
}

export const URGENCY_ORDER: Record<Urgency, number> = { LOW: 0, MODERATE: 1, HIGH: 2, EMERGENCY: 3 };

export function maxUrgency(...levels: (Urgency | null | undefined)[]): Urgency {
  return levels.reduce<Urgency>((acc, l) => (l && URGENCY_ORDER[l] > URGENCY_ORDER[acc] ? l : acc), "LOW");
}

/** Keeps only the newest active version of each rule_key. */
export function latestActive(rules: ClinicalRule[]): ClinicalRule[] {
  const byKey = new Map<string, ClinicalRule>();
  for (const r of rules) {
    if (!r.active) continue;
    const cur = byKey.get(r.rule_key);
    if (!cur || r.version > cur.version) byKey.set(r.rule_key, r);
  }
  return [...byKey.values()];
}

export interface MeasurementInput {
  type: string;
  value: number;
  secondaryValue?: number | null;
  context?: string | null;
  age?: number | null;
  sex?: string | null;
  pregnancyStatus?: string | null;
  diagnosed?: boolean | null;
  jurisdiction?: string | null;
}

function inRange(v: number | null | undefined, min: number | null, max: number | null) {
  if (v == null) return false;
  if (min == null && max == null) return false;
  return (min == null || v >= min) && (max == null || v < max);
}

/**
 * Selects the rule that applies to a measurement.
 * - Context, age, sex, pregnancy and diagnosis filters must match when the rule specifies them.
 * - Jurisdiction-specific rules beat GLOBAL ones; diagnosis-specific rules beat "any".
 * - Blood pressure uses "either value" logic (systolic OR diastolic) and the most severe category wins.
 */
export function selectMeasurementRule(rules: ClinicalRule[], m: MeasurementInput): ClinicalRule | null {
  const candidates = latestActive(rules).filter((r) => {
    if (r.rule_kind !== "measurement_threshold" || r.measurement_type !== m.type) return false;
    if (r.context && r.context !== (m.context ?? null)) {
      const ctxGroups: Record<string, string[]> = { fasting: ["fasting", "before_meal"], before_meal: ["before_meal", "fasting"], random: ["random", "bedtime"] };
      if (!(ctxGroups[r.context] ?? []).includes(m.context ?? "")) return false;
    }
    if (r.age_min != null && (m.age == null || m.age < r.age_min)) return false;
    if (r.age_max != null && (m.age == null || m.age > r.age_max)) return false;
    if (r.sex && r.sex !== m.sex) return false;
    if (r.pregnancy_status && r.pregnancy_status !== m.pregnancyStatus) return false;
    if (r.diagnosis_status === "diagnosed" && m.diagnosed !== true) return false;
    if (r.diagnosis_status === "not_diagnosed" && m.diagnosed === true) return false;
    if (r.jurisdiction !== "GLOBAL" && r.jurisdiction !== (m.jurisdiction ?? "").toUpperCase()) return false;
    const primary = inRange(m.value, r.min_value, r.max_value);
    const secondary = inRange(m.secondaryValue, r.secondary_min, r.secondary_max);
    if (m.type === "blood_pressure") {
      // Category matches if either reading falls in its band.
      return primary || secondary;
    }
    return primary;
  });
  if (!candidates.length) return null;
  const specificity = (r: ClinicalRule) =>
    (r.jurisdiction !== "GLOBAL" ? 8 : 0) + (r.diagnosis_status && r.diagnosis_status !== "any" ? 4 : 0) + (r.context ? 2 : 0) + (r.age_min != null || r.age_max != null ? 1 : 0);
  candidates.sort((a, b) => {
    const sev = URGENCY_ORDER[b.severity] - URGENCY_ORDER[a.severity];
    if (m.type === "blood_pressure" && sev !== 0) return sev;
    const spec = specificity(b) - specificity(a);
    if (spec !== 0) return spec;
    if (sev !== 0) return sev;
    return a.priority - b.priority;
  });
  // For non-BP measurements prefer the most specific rule-set, then the most severe band within it.
  if (m.type !== "blood_pressure") {
    const topSpec = specificity(candidates[0]!);
    const sameSpec = candidates.filter((c) => specificity(c) === topSpec);
    sameSpec.sort((a, b) => URGENCY_ORDER[b.severity] - URGENCY_ORDER[a.severity]);
    return sameSpec[0]!;
  }
  return candidates[0]!;
}
