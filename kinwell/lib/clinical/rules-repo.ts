import "server-only";
import { getDb } from "@/lib/database/client";
import type { ClinicalRule } from "./rules";

let cache: { at: number; rules: ClinicalRule[] } | null = null;

/** Loads active clinical rules (short in-process cache; edits through the admin UI clear it). */
export async function loadClinicalRules(force = false): Promise<ClinicalRule[]> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.rules;
  const db = await getDb();
  const rules = (await db.query<ClinicalRule>("select * from clinical_rules where active order by rule_kind, measurement_type, priority")).rows;
  cache = { at: Date.now(), rules };
  return rules;
}

export function clearRulesCache() {
  cache = null;
}
