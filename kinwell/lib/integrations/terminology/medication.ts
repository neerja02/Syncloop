import { env } from "@/lib/config/env";
import { similarity } from "@/lib/utils/text";

/**
 * Medication terminology normalisation.
 *
 * Input: raw medicine text typed by a user or read from a document (often misspelled).
 * Output: candidate canonical names with a confidence score. Callers MUST NOT write an uncertain match into a
 * permanent record — see decideConfidence("medication_name", …) and the confirmation UI.
 */
export interface MedicationMatch {
  canonical_name: string;
  generic_name: string;
  brand_name: string | null;
  external_id: string | null;
  confidence: number;
  drug_classes: string[];
}

export interface MedicationNormalisation {
  original_text: string;
  canonical_name: string | null;
  brand_name: string | null;
  generic_name: string | null;
  strength: string | null;
  form: string | null;
  external_id: string | null;
  confidence: number;
  possible_matches: MedicationMatch[];
}

export interface MedicationTerminologyProvider {
  readonly name: string;
  normalise(rawText: string): Promise<MedicationNormalisation>;
}

interface DrugEntry {
  generic: string;
  brands: string[];
  classes: string[];
  id: string;
}

/** Local reference list used in development. It is intentionally small and is not a complete drug database. */
export const LOCAL_DRUGS: DrugEntry[] = [
  { generic: "Metformin", brands: ["Glycomet", "Glucophage"], classes: ["biguanide", "antidiabetic"], id: "local:metformin" },
  { generic: "Glimepiride", brands: ["Amaryl"], classes: ["sulfonylurea", "antidiabetic"], id: "local:glimepiride" },
  { generic: "Sitagliptin", brands: ["Januvia"], classes: ["dpp4_inhibitor", "antidiabetic"], id: "local:sitagliptin" },
  { generic: "Dapagliflozin", brands: ["Forxiga"], classes: ["sglt2_inhibitor", "antidiabetic"], id: "local:dapagliflozin" },
  { generic: "Empagliflozin", brands: ["Jardiance"], classes: ["sglt2_inhibitor", "antidiabetic"], id: "local:empagliflozin" },
  { generic: "Insulin glargine", brands: ["Lantus", "Basalog"], classes: ["insulin", "antidiabetic"], id: "local:insulin_glargine" },
  { generic: "Amlodipine", brands: ["Norvasc", "Amlong"], classes: ["calcium_channel_blocker", "antihypertensive"], id: "local:amlodipine" },
  { generic: "Telmisartan", brands: ["Telma", "Micardis"], classes: ["arb", "antihypertensive"], id: "local:telmisartan" },
  { generic: "Losartan", brands: ["Cozaar", "Losar"], classes: ["arb", "antihypertensive"], id: "local:losartan" },
  { generic: "Ramipril", brands: ["Cardace", "Altace"], classes: ["ace_inhibitor", "antihypertensive"], id: "local:ramipril" },
  { generic: "Atenolol", brands: ["Tenormin", "Aten"], classes: ["beta_blocker", "antihypertensive"], id: "local:atenolol" },
  { generic: "Metoprolol", brands: ["Lopressor", "Metolar"], classes: ["beta_blocker", "antihypertensive"], id: "local:metoprolol" },
  { generic: "Hydrochlorothiazide", brands: ["Aquazide"], classes: ["thiazide_diuretic", "antihypertensive"], id: "local:hydrochlorothiazide" },
  { generic: "Furosemide", brands: ["Lasix"], classes: ["loop_diuretic"], id: "local:furosemide" },
  { generic: "Spironolactone", brands: ["Aldactone"], classes: ["potassium_sparing_diuretic"], id: "local:spironolactone" },
  { generic: "Atorvastatin", brands: ["Lipitor", "Atorva"], classes: ["statin"], id: "local:atorvastatin" },
  { generic: "Rosuvastatin", brands: ["Crestor", "Rosuvas"], classes: ["statin"], id: "local:rosuvastatin" },
  { generic: "Aspirin", brands: ["Ecosprin", "Disprin"], classes: ["nsaid", "antiplatelet"], id: "local:aspirin" },
  { generic: "Clopidogrel", brands: ["Plavix", "Clopilet"], classes: ["antiplatelet"], id: "local:clopidogrel" },
  { generic: "Warfarin", brands: ["Coumadin"], classes: ["anticoagulant"], id: "local:warfarin" },
  { generic: "Paracetamol", brands: ["Crocin", "Dolo 650", "Calpol", "Tylenol", "Acetaminophen"], classes: ["analgesic", "antipyretic"], id: "local:paracetamol" },
  { generic: "Ibuprofen", brands: ["Brufen", "Advil"], classes: ["nsaid", "analgesic"], id: "local:ibuprofen" },
  { generic: "Diclofenac", brands: ["Voveran", "Voltaren"], classes: ["nsaid", "analgesic"], id: "local:diclofenac" },
  { generic: "Cetirizine", brands: ["Zyrtec", "Cetzine"], classes: ["antihistamine"], id: "local:cetirizine" },
  { generic: "Levocetirizine", brands: ["Xyzal", "Levocet"], classes: ["antihistamine"], id: "local:levocetirizine" },
  { generic: "Montelukast", brands: ["Singulair", "Montair"], classes: ["leukotriene_antagonist"], id: "local:montelukast" },
  { generic: "Salbutamol", brands: ["Asthalin", "Ventolin", "Albuterol"], classes: ["bronchodilator"], id: "local:salbutamol" },
  { generic: "Amoxicillin", brands: ["Mox", "Amoxil"], classes: ["penicillin", "antibiotic"], id: "local:amoxicillin" },
  { generic: "Amoxicillin and clavulanate", brands: ["Augmentin", "Clavam"], classes: ["penicillin", "antibiotic"], id: "local:amoxiclav" },
  { generic: "Azithromycin", brands: ["Azithral", "Zithromax"], classes: ["macrolide", "antibiotic"], id: "local:azithromycin" },
  { generic: "Pantoprazole", brands: ["Pan 40", "Protonix"], classes: ["ppi"], id: "local:pantoprazole" },
  { generic: "Omeprazole", brands: ["Omez", "Prilosec"], classes: ["ppi"], id: "local:omeprazole" },
  { generic: "Levothyroxine", brands: ["Thyronorm", "Eltroxin", "Synthroid"], classes: ["thyroid_hormone"], id: "local:levothyroxine" },
  { generic: "Cholecalciferol", brands: ["Vitamin D3", "Uprise D3", "Calcirol"], classes: ["vitamin"], id: "local:cholecalciferol" },
  { generic: "Ondansetron", brands: ["Emeset", "Zofran"], classes: ["antiemetic"], id: "local:ondansetron" },
  { generic: "Domperidone", brands: ["Domstal"], classes: ["antiemetic"], id: "local:domperidone" },
  { generic: "Prednisolone", brands: ["Wysolone", "Omnacortil"], classes: ["corticosteroid"], id: "local:prednisolone" },
  { generic: "Sertraline", brands: ["Zoloft", "Serta"], classes: ["ssri"], id: "local:sertraline" },
  { generic: "Escitalopram", brands: ["Lexapro", "Nexito"], classes: ["ssri"], id: "local:escitalopram" },
  { generic: "Melatonin", brands: ["Meloset"], classes: ["sleep_aid"], id: "local:melatonin" },
  { generic: "Oral rehydration salts", brands: ["ORS", "Electral"], classes: ["rehydration"], id: "local:ors" },
];

const FORMS = ["tablet", "tab", "capsule", "cap", "syrup", "injection", "inhaler", "drops", "cream", "ointment", "suspension", "sachet"];

export function parseStrength(text: string): string | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|iu|units?|%)\b/i);
  return m ? `${m[1]} ${m[2]!.toLowerCase().replace("units", "units")}` : null;
}

export function parseForm(text: string): string | null {
  const lower = text.toLowerCase();
  const f = FORMS.find((x) => new RegExp(`\\b${x}s?\\b`).test(lower));
  if (!f) return null;
  return f === "tab" ? "tablet" : f === "cap" ? "capsule" : f;
}

function stripDetails(text: string) {
  return text
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|iu|units?|%)\b/gi, " ")
    .replace(new RegExp(`\\b(${FORMS.join("|")})s?\\b`, "gi"), " ")
    .replace(/\b(sr|xr|er|od|bd|tds|once|twice|daily|a day|morning|night)\b/gi, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class LocalMedicationTerminologyProvider implements MedicationTerminologyProvider {
  readonly name = "local-reference";

  async normalise(rawText: string): Promise<MedicationNormalisation> {
    const core = stripDetails(rawText);
    const scored: MedicationMatch[] = [];
    for (const d of LOCAL_DRUGS) {
      const names = [{ n: d.generic, brand: null as string | null }, ...d.brands.map((b) => ({ n: b, brand: b }))];
      let best = 0;
      let bestBrand: string | null = null;
      for (const { n, brand } of names) {
        const s = similarity(core, n.toLowerCase());
        if (s > best) {
          best = s;
          bestBrand = brand;
        }
      }
      if (best >= 0.55) {
        scored.push({
          canonical_name: d.generic,
          generic_name: d.generic,
          brand_name: bestBrand,
          external_id: d.id,
          confidence: Math.round(best * 100) / 100,
          drug_classes: d.classes,
        });
      }
    }
    scored.sort((a, b) => b.confidence - a.confidence);
    const top = scored[0];
    return {
      original_text: rawText,
      canonical_name: top?.canonical_name ?? null,
      brand_name: top?.brand_name ?? null,
      generic_name: top?.generic_name ?? null,
      strength: parseStrength(rawText),
      form: parseForm(rawText),
      external_id: top?.external_id ?? null,
      confidence: top?.confidence ?? 0,
      possible_matches: scored.slice(0, 4),
    };
  }
}

/** Production adapter using the U.S. National Library of Medicine RxNav approximate-term API (no key required). */
export class RxNavMedicationTerminologyProvider implements MedicationTerminologyProvider {
  readonly name = "rxnav";
  private fallback = new LocalMedicationTerminologyProvider();

  async normalise(rawText: string): Promise<MedicationNormalisation> {
    try {
      const term = stripDetails(rawText);
      const res = await fetch(`https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=4`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { approximateGroup?: { candidate?: { rxcui: string; score: string; name?: string }[] } };
      const candidates = json.approximateGroup?.candidate ?? [];
      if (!candidates.length) return this.fallback.normalise(rawText);
      const local = await this.fallback.normalise(rawText);
      const matches: MedicationMatch[] = candidates
        .filter((c) => c.name)
        .map((c) => ({
          canonical_name: c.name!,
          generic_name: c.name!,
          brand_name: null,
          external_id: `rxcui:${c.rxcui}`,
          confidence: Math.min(1, Number(c.score) / 100),
          drug_classes: local.possible_matches.find((m) => m.canonical_name.toLowerCase() === c.name!.toLowerCase())?.drug_classes ?? [],
        }));
      const top = matches[0] ?? local.possible_matches[0];
      return { ...local, canonical_name: top?.canonical_name ?? null, generic_name: top?.generic_name ?? null, external_id: top?.external_id ?? null, confidence: top?.confidence ?? 0, possible_matches: matches.length ? matches : local.possible_matches };
    } catch {
      return this.fallback.normalise(rawText);
    }
  }
}

export function getMedicationTerminology(): MedicationTerminologyProvider {
  return env.medicationTerminology === "rxnav" ? new RxNavMedicationTerminologyProvider() : new LocalMedicationTerminologyProvider();
}

export function drugClassesFor(name: string): string[] {
  const lower = name.toLowerCase();
  const d = LOCAL_DRUGS.find((x) => x.generic.toLowerCase() === lower || x.brands.some((b) => b.toLowerCase() === lower));
  return d?.classes ?? [];
}

/**
 * A small demonstration list of well-known interaction cautions. It is NOT a complete interaction checker,
 * and the medication agent always says so and points to the doctor/pharmacist.
 */
export const INTERACTION_CAUTIONS: { a: string; b: string; note: string }[] = [
  { a: "anticoagulant", b: "nsaid", note: "Taking an anticoagulant with an NSAID can increase bleeding risk." },
  { a: "anticoagulant", b: "antiplatelet", note: "Combining blood thinners can increase bleeding risk." },
  { a: "ace_inhibitor", b: "potassium_sparing_diuretic", note: "This combination can raise potassium levels; monitoring is usually needed." },
  { a: "arb", b: "potassium_sparing_diuretic", note: "This combination can raise potassium levels; monitoring is usually needed." },
  { a: "antihypertensive", b: "nsaid", note: "NSAIDs can raise blood pressure and reduce the effect of some blood-pressure medicines." },
  { a: "ssri", b: "nsaid", note: "SSRIs with NSAIDs can increase the risk of stomach bleeding." },
];
