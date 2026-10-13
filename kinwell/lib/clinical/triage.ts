import type { Urgency } from "@/types/domain";
import type { ConceptMatch } from "@/lib/integrations/terminology/clinical";
import { latestActive, maxUrgency, URGENCY_ORDER, type ClinicalRule } from "./rules";

export interface TriageMeasurementSignal {
  type: string;
  severity: Urgency;
}

export interface TriageResult {
  level: Urgency;
  matchedRules: { id: string; rule_key: string; version: number; severity: Urgency; label: string; action: string }[];
  redFlags: string[];
  crisis: boolean;
  isEmergency: boolean;
}

/**
 * Safety/triage engine. Every symptom conversation passes through here BEFORE any specialist agent runs.
 * Patterns are clinician-reviewed rows in clinical_rules (rule_kind = 'triage_pattern'); this function only
 * evaluates them. Negated mentions ("no chest pain") never match.
 */
export function evaluateTriage(concepts: ConceptMatch[], rules: ClinicalRule[], measurements: TriageMeasurementSignal[] = []): TriageResult {
  const present = new Set(concepts.filter((c) => !c.negated).map((c) => c.code));
  const matched: TriageResult["matchedRules"] = [];
  let crisis = false;
  for (const r of latestActive(rules)) {
    if (r.rule_kind !== "triage_pattern" || !r.pattern) continue;
    const p = r.pattern;
    if (p.all && !p.all.every((c) => present.has(c))) continue;
    if (p.any && p.any.length && !p.any.some((c) => present.has(c))) continue;
    if (p.measurement) {
      const sig = measurements.find((m) => m.type === p.measurement!.type);
      if (!sig || URGENCY_ORDER[sig.severity] < URGENCY_ORDER[p.measurement.minSeverity]) continue;
    }
    if (!p.all?.length && !p.any?.length && !p.measurement) continue;
    if (p.crisis) crisis = true;
    matched.push({ id: r.id, rule_key: r.rule_key, version: r.version, severity: r.severity, label: r.status_label, action: r.recommended_action });
  }
  matched.sort((a, b) => URGENCY_ORDER[b.severity] - URGENCY_ORDER[a.severity]);
  const level = maxUrgency(...matched.map((m) => m.severity));
  const redFlags = concepts.filter((c) => !c.negated && (c.category === "safety" || matched.some((m) => m.severity !== "LOW"))).map((c) => c.label);
  return { level, matchedRules: matched, redFlags: [...new Set(redFlags)], crisis, isEmergency: level === "EMERGENCY" };
}
