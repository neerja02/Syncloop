"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { getDb } from "@/lib/database/client";
import { ForbiddenError, logAccess } from "@/lib/security/access";
import { clearRulesCache } from "@/lib/clinical/rules-repo";

const ruleEdit = z.object({
  id: z.string().uuid(),
  min_value: z.coerce.number().nullable(),
  max_value: z.coerce.number().nullable(),
  secondary_min: z.coerce.number().nullable().optional(),
  secondary_max: z.coerce.number().nullable().optional(),
  severity: z.enum(["LOW", "MODERATE", "HIGH", "EMERGENCY"]),
  status_label: z.string().trim().min(2).max(120),
  recommended_action: z.string().trim().min(5).max(1000),
  reviewed_by: z.string().trim().min(2).max(120),
});

/** Editing a rule creates a NEW version (the previous one is deactivated), keeping full history. */
export async function saveRuleVersionAction(input: unknown) {
  return run(async (actor) => {
    if (actor.role !== "ADMIN" && actor.role !== "DOCTOR") throw new ForbiddenError("Only clinicians or admins can change clinical rules.");
    const d = ruleEdit.parse(input);
    const db = await getDb();
    const cur = (await db.query<Record<string, unknown> & { rule_key: string; version: number }>("select * from clinical_rules where id = $1", [d.id])).rows[0];
    if (!cur) throw new Error("Rule not found");
    const latest = (await db.query<{ v: number }>("select max(version) as v from clinical_rules where rule_key = $1", [cur.rule_key])).rows[0]!.v;
    await db.transaction(async (tx) => {
      await tx.query("update clinical_rules set active = false where rule_key = $1", [cur.rule_key]);
      await tx.query(
        `insert into clinical_rules(rule_key, rule_kind, condition, measurement_type, context, diagnosis_status, age_min, age_max, sex, pregnancy_status, unit, min_value, max_value, secondary_min, secondary_max,
          pattern, severity, status_label, recommended_action, jurisdiction, source, version, priority, reviewed_by, reviewed_at, active, created_by)
         select rule_key, rule_kind, condition, measurement_type, context, diagnosis_status, age_min, age_max, sex, pregnancy_status, unit, $2, $3, $4, $5,
          pattern, $6, $7, $8, jurisdiction, source, $9, priority, $10, now(), true, $11 from clinical_rules where id = $1`,
        [d.id, d.min_value, d.max_value, d.secondary_min ?? cur.secondary_min ?? null, d.secondary_max ?? cur.secondary_max ?? null, d.severity, d.status_label, d.recommended_action, latest + 1, d.reviewed_by, actor.id],
      );
    });
    clearRulesCache();
    await logAccess(actor, "clinical_rule_version", "clinical_rule", d.id, null, { rule_key: cur.rule_key, version: latest + 1 });
    revalidatePath("/admin", "layout");
    revalidatePath("/doctor", "layout");
  });
}
