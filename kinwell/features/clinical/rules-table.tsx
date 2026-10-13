import { Badge, Card, severityTone } from "@/components/ui/misc";
import { RuleEditor } from "@/features/doctor/components/doctor-forms";
import { formatDate } from "@/lib/utils/format";
import type { ClinicalRule } from "@/lib/clinical/rules";

/** Shared clinical-rule table for the doctor settings page and the admin console. */
export function RulesTable({ rules, editable }: { rules: ClinicalRule[]; editable: boolean }) {
  const groups = new Map<string, ClinicalRule[]>();
  for (const r of rules) {
    const k = r.rule_kind === "triage_pattern" ? "Triage patterns" : (r.measurement_type ?? "other").replace(/_/g, " ");
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([g, rs]) => (
        <section key={g} aria-label={g}>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted">{g}</h3>
          <Card className="divide-y divide-line">
            {rs.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-[12.5px] text-muted">{r.rule_key}</code>
                  <span className="text-[12px] text-muted">v{r.version}</span>
                  <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>
                  <span className="font-medium">{r.status_label}</span>
                  {editable && <span className="ml-auto"><RuleEditor rule={r} /></span>}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {r.rule_kind === "triage_pattern"
                    ? `Pattern: ${JSON.stringify(r.pattern)}`
                    : `${r.context ? r.context.replace("_", " ") + " · " : ""}${r.diagnosis_status && r.diagnosis_status !== "any" ? r.diagnosis_status.replace("_", " ") + " · " : ""}${r.min_value ?? "−∞"} ≤ value < ${r.max_value ?? "∞"}${r.secondary_min != null || r.secondary_max != null ? ` or diastolic ${r.secondary_min ?? "−∞"}–${r.secondary_max ?? "∞"}` : ""} ${r.unit ?? ""}`}
                </p>
                <p className="mt-1 text-sm">{r.recommended_action}</p>
                <p className="mt-1 text-[12px] text-muted">
                  {r.source} · {r.jurisdiction} · reviewed by {r.reviewed_by ?? "—"}
                  {r.reviewed_at ? ` (${formatDate(r.reviewed_at)})` : ""}
                </p>
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
