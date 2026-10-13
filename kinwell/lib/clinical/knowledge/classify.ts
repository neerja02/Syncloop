import { withEnglishReading } from "@/lib/clinical/lexicon";
import { ALL_SYMPTOMS, type KnowledgeDomain, type KnowledgeSymptom } from "./registry";

export interface SymptomMatch {
  symptom: KnowledgeSymptom;
  domain: KnowledgeDomain;
  matched: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every phrase that names a symptom, longest first, so "chest pain" wins over "pain". */
const PHRASES = ALL_SYMPTOMS.flatMap((s) => [s.name, ...s.synonyms, ...s.variants].map((p) => ({ p: p.toLowerCase(), s })))
  .filter((x) => x.p.length >= 3 && x.p !== "-")
  .sort((a, b) => b.p.length - a.p.length)
  .map((x) => ({ ...x, re: new RegExp(`(^|[^a-z])${escape(x.p)}(s|es)?([^a-z]|$)`) }));

/** Finds the symptom a message is most likely about, across all 26 domains (English, Hindi, Punjabi, Hinglish). */
export function classifySymptom(text: string): SymptomMatch | null {
  const t = ` ${withEnglishReading(text).toLowerCase().replace(/[’']/g, "'")} `;
  for (const x of PHRASES) {
    if (x.re.test(t)) return { symptom: x.s, domain: x.s.domain, matched: x.p };
  }
  return null;
}
