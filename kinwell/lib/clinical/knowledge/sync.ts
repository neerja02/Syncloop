import { createHash } from "node:crypto";
import type { Db } from "@/lib/database/client";
import { DOMAINS, REFERENCES } from "./registry";

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/**
 * Writes the knowledge registry to the database. Unchanged rows are left alone; a changed row gets a new
 * version, goes back to "pending clinical review", and its previous content is kept in knowledge_versions.
 * Safe to run on every start.
 */
export async function syncKnowledge(db: Db) {
  const exists = (await db.query<{ t: string | null }>("select to_regclass('public.knowledge_domains')::text as t")).rows[0]?.t;
  if (!exists) return;
  for (const r of REFERENCES) {
    await db.query(
      `insert into knowledge_references(code, title, publisher, url, notes) values ($1,$2,$3,$4,$5)
       on conflict (code) do update set title = excluded.title, publisher = excluded.publisher, url = excluded.url, notes = excluded.notes, updated_at = now()`,
      [r.code, r.title, r.publisher, r.url, "Publisher-level pointer; specific pages to be chosen during clinical review."],
    );
  }
  const current = new Map((await db.query<{ code: string; content_hash: string; version: number }>("select code, content_hash, version from knowledge_domains")).rows.map((r) => [r.code, r]));
  const currentSymptoms = new Map((await db.query<{ code: string; content_hash: string; version: number }>("select code, content_hash, version from knowledge_symptoms")).rows.map((r) => [r.code, r]));

  for (const d of DOMAINS) {
    const content = { number: d.number, name: d.name, education: d.education, warningSigns: d.warningSigns, specialties: d.specialties, references: d.references };
    const h = hash(content);
    const prev = current.get(d.code);
    if (!prev || prev.content_hash !== h) {
      const version = prev ? prev.version + 1 : 1;
      await db.query(
        `insert into knowledge_domains(code, number, name, education, warning_signs, specialties, reference_codes, content_hash, version, review_status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_clinical_review')
         on conflict (code) do update set number = excluded.number, name = excluded.name, education = excluded.education, warning_signs = excluded.warning_signs,
           specialties = excluded.specialties, reference_codes = excluded.reference_codes, content_hash = excluded.content_hash, version = excluded.version,
           review_status = 'pending_clinical_review', reviewed_by = null, last_reviewed_at = null, updated_at = now()`,
        [d.code, d.number, d.name, d.education, d.warningSigns, d.specialties, d.references, h, version],
      );
      await db.query("insert into knowledge_versions(entity, code, version, content) values ('domain',$1,$2,$3::jsonb)", [d.code, version, JSON.stringify(content)]);
    }
    for (const s of d.symptoms) {
      const sc = { domain: d.code, name: s.name, synonyms: s.synonyms, variants: s.variants, flow: s.flow };
      const sh = hash(sc);
      const sp = currentSymptoms.get(s.code);
      if (sp && sp.content_hash === sh) continue;
      const version = sp ? sp.version + 1 : 1;
      await db.query(
        `insert into knowledge_symptoms(code, domain_code, display_name, synonyms, language_variants, guided_flow, content_hash, version, review_status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'pending_clinical_review')
         on conflict (code) do update set domain_code = excluded.domain_code, display_name = excluded.display_name, synonyms = excluded.synonyms,
           language_variants = excluded.language_variants, guided_flow = excluded.guided_flow, content_hash = excluded.content_hash, version = excluded.version,
           review_status = 'pending_clinical_review', reviewed_by = null, last_reviewed_at = null, updated_at = now()`,
        [s.code, d.code, s.name, s.synonyms, s.variants, s.flow, sh, version],
      );
      await db.query("insert into knowledge_versions(entity, code, version, content) values ('symptom',$1,$2,$3::jsonb)", [s.code, version, JSON.stringify(sc)]);
    }
  }
}
