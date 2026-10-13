import { env } from "@/lib/config/env";

/**
 * Clinical terminology normalisation. Maps casual wording to concepts used for retrieval and triage matching.
 * It never turns casual wording into a confirmed diagnosis: concepts describe what the user *said*.
 */
export interface ClinicalConcept {
  code: string;
  label: string;
  category: "symptom" | "measurement" | "condition" | "lifestyle" | "safety";
}

export interface ConceptMatch extends ClinicalConcept {
  matchedText: string;
  negated: boolean;
}

export interface ClinicalTerminologyProvider {
  readonly name: string;
  extractConcepts(text: string): Promise<ConceptMatch[]>;
  /** Expands a query with synonyms and concept labels for better retrieval. */
  expandQuery(text: string): Promise<string>;
}

type ConceptDef = ClinicalConcept & { synonyms: string[] };

export const CONCEPTS: ConceptDef[] = [
  // Measurements & conditions
  { code: "elevated_blood_glucose", label: "Elevated blood glucose", category: "measurement", synonyms: ["high sugar", "sugar is high", "sugar has been high", "sugar was high", "high blood sugar", "high glucose", "hyperglycemia", "hyperglycaemia", "sugar high"] },
  { code: "low_blood_glucose", label: "Low blood glucose", category: "measurement", synonyms: ["low sugar", "sugar is low", "sugar dropped", "hypoglycemia", "hypoglycaemia", "hypo"] },
  { code: "blood_glucose", label: "Blood glucose", category: "measurement", synonyms: ["sugar", "glucose", "blood sugar", "fbs", "ppbs", "rbs", "sugar level"] },
  { code: "hba1c", label: "HbA1c", category: "measurement", synonyms: ["hba1c", "a1c", "glycated haemoglobin", "glycated hemoglobin", "glycosylated"] },
  { code: "blood_pressure", label: "Blood pressure", category: "measurement", synonyms: ["bp", "blood pressure", "pressure reading", "hypertension", "high bp", "low bp"] },
  { code: "cholesterol", label: "Cholesterol", category: "measurement", synonyms: ["cholesterol", "ldl", "hdl", "triglycerides", "lipid profile", "lipids"] },
  { code: "diabetes", label: "Diabetes", category: "condition", synonyms: ["diabetes", "diabetic", "type 2", "type 1", "t2dm"] },
  { code: "thyroid", label: "Thyroid", category: "condition", synonyms: ["thyroid", "tsh", "hypothyroid", "hyperthyroid"] },
  // Emergency-relevant symptoms
  { code: "severe_breathing_difficulty", label: "Severe breathing difficulty", category: "symptom", synonyms: ["can't breathe", "cannot breathe", "cant breathe", "unable to breathe", "gasping for air", "struggling to breathe", "lips turning blue", "lips are blue", "choking"] },
  { code: "shortness_of_breath", label: "Shortness of breath", category: "symptom", synonyms: ["breathless", "short of breath", "shortness of breath", "difficulty breathing", "hard to breathe", "out of breath", "breathlessness", "wheezing"] },
  { code: "chest_pain", label: "Chest pain or pressure", category: "symptom", synonyms: ["chest pain", "chest tightness", "tight chest", "pressure in my chest", "pressure in chest", "chest hurts", "pain in my chest", "pain in chest", "chest discomfort", "heaviness in chest", "chest pressure", "chest heaviness", "heavy chest", "chest feels heavy", "chest is heavy", "chest feels tight"] },
  { code: "radiating_pain", label: "Pain spreading to arm, jaw or back", category: "symptom", synonyms: ["left arm", "pain in my arm", "jaw pain", "pain spreading", "radiating"] },
  { code: "sweating", label: "Sweating / clammy", category: "symptom", synonyms: ["sweating", "sweaty", "clammy", "cold sweat"] },
  { code: "palpitations", label: "Palpitations", category: "symptom", synonyms: ["heart beating fast", "heart is racing", "racing heart", "palpitations", "heart pounding", "fluttering heart"] },
  { code: "facial_droop", label: "Facial drooping", category: "symptom", synonyms: ["face drooping", "face is drooping", "drooping face", "face droop", "one side of face", "smile is uneven"] },
  { code: "slurred_speech", label: "Slurred or confused speech", category: "symptom", synonyms: ["slurred speech", "speech is slurred", "slurring", "can't speak properly", "trouble speaking", "words are jumbled"] },
  { code: "one_sided_weakness", label: "Weakness or numbness on one side", category: "symptom", synonyms: ["arm weakness", "weak on one side", "numb on one side", "can't lift arm", "cannot lift arm", "one side is weak", "numbness on one side", "leg gave way on one side"] },
  { code: "loss_of_consciousness", label: "Loss of consciousness", category: "symptom", synonyms: ["fainted", "passed out", "unconscious", "not responding", "unresponsive", "collapsed", "blacked out", "won't wake up"] },
  { code: "seizure", label: "Seizure", category: "symptom", synonyms: ["seizure", "convulsion", "fitting", "having a fit"] },
  { code: "throat_swelling", label: "Throat, tongue or lip swelling", category: "symptom", synonyms: ["throat swelling", "throat is swelling", "throat closing", "tongue swelling", "swollen tongue", "lips swelling", "swollen lips", "face swelling"] },
  { code: "severe_allergic_reaction", label: "Severe allergic reaction", category: "symptom", synonyms: ["anaphylaxis", "severe allergic reaction", "allergic reaction", "hives all over"] },
  { code: "severe_bleeding", label: "Severe bleeding", category: "symptom", synonyms: ["bleeding heavily", "won't stop bleeding", "wont stop bleeding", "heavy bleeding", "lots of blood", "bleeding a lot", "vomiting blood", "coughing up blood", "blood in vomit"] },
  { code: "poisoning_overdose", label: "Poisoning or overdose", category: "safety", synonyms: ["overdose", "took too many pills", "too many tablets", "swallowed poison", "poisoning", "drank bleach", "ate poison", "swallowed chemicals"] },
  { code: "self_harm", label: "Thoughts of self-harm", category: "safety", synonyms: ["kill myself", "suicide", "suicidal", "end my life", "hurt myself", "self harm", "self-harm", "don't want to live", "dont want to live", "want to die"] },
  { code: "serious_injury", label: "Serious injury", category: "symptom", synonyms: ["head injury", "hit my head", "broken bone", "bone sticking out", "serious accident", "car accident", "deep cut", "burn"] },
  { code: "worst_headache", label: "Sudden severe headache", category: "symptom", synonyms: ["worst headache", "thunderclap", "sudden severe headache", "worst headache of my life"] },
  { code: "stiff_neck", label: "Stiff neck", category: "symptom", synonyms: ["stiff neck", "neck stiffness", "can't bend neck"] },
  { code: "confusion", label: "Confusion", category: "symptom", synonyms: ["confused", "confusion", "disoriented", "not making sense"] },
  // Common symptoms
  { code: "headache", label: "Headache", category: "symptom", synonyms: ["headache", "head ache", "head hurts", "migraine", "head is pounding"] },
  { code: "fever", label: "Fever", category: "symptom", synonyms: ["fever", "feverish", "high temperature", "temperature", "temp is"] },
  { code: "cough", label: "Cough", category: "symptom", synonyms: ["cough", "coughing", "dry cough", "wet cough"] },
  { code: "sore_throat", label: "Sore throat", category: "symptom", synonyms: ["sore throat", "throat pain", "throat hurts", "scratchy throat"] },
  { code: "cold_flu", label: "Cold or flu symptoms", category: "symptom", synonyms: ["cold", "runny nose", "blocked nose", "sneezing", "flu", "congestion"] },
  { code: "vomiting", label: "Vomiting", category: "symptom", synonyms: ["vomiting", "vomited", "throwing up", "threw up", "nausea", "nauseous"] },
  { code: "diarrhoea", label: "Diarrhoea", category: "symptom", synonyms: ["diarrhoea", "diarrhea", "loose motions", "loose stools"] },
  { code: "dizziness", label: "Dizziness", category: "symptom", synonyms: ["dizzy", "dizziness", "lightheaded", "light headed", "vertigo", "room spinning"] },
  { code: "fatigue", label: "Tiredness", category: "symptom", synonyms: ["tired", "exhausted", "fatigue", "fatigued", "no energy", "weak", "weakness"] },
  { code: "abdominal_pain", label: "Abdominal pain", category: "symptom", synonyms: ["stomach pain", "abdominal pain", "tummy ache", "stomach ache", "belly pain", "stomach hurts"] },
  { code: "rash", label: "Rash", category: "symptom", synonyms: ["rash", "itchy skin", "hives", "red spots", "skin irritation"] },
  { code: "back_pain", label: "Back pain", category: "symptom", synonyms: ["back pain", "backache", "lower back", "back hurts"] },
  { code: "excessive_thirst", label: "Excessive thirst or urination", category: "symptom", synonyms: ["very thirsty", "excessive thirst", "peeing a lot", "urinating a lot", "frequent urination"] },
  { code: "blurred_vision", label: "Blurred vision", category: "symptom", synonyms: ["blurred vision", "blurry vision", "vision is blurry", "can't see clearly"] },
  // Lifestyle
  { code: "sleep_problem", label: "Sleep difficulty", category: "lifestyle", synonyms: ["can't sleep", "cannot sleep", "not sleeping", "haven't been sleeping", "insomnia", "sleeping badly", "poor sleep", "waking up at night", "trouble sleeping"] },
  { code: "stress", label: "Stress or low mood", category: "lifestyle", synonyms: ["stressed", "stress", "anxious", "anxiety", "overwhelmed", "low mood", "feeling down", "sad", "burnt out", "burned out"] },
  { code: "exercise", label: "Exercise", category: "lifestyle", synonyms: ["exercise", "workout", "walk", "walking", "run", "running", "gym", "yoga", "cycling", "swim", "steps"] },
  { code: "nutrition", label: "Nutrition", category: "lifestyle", synonyms: ["diet", "eat", "eating", "food", "meal", "breakfast", "lunch", "dinner", "snack", "carbs", "sugar intake", "protein", "nutrition"] },
  { code: "pregnancy", label: "Pregnancy", category: "condition", synonyms: ["pregnant", "pregnancy", "expecting a baby"] },
];

const NEGATORS = /\b(no|not|without|never|denies|deny|don't have|dont have|doesn't have|isn't|wasn't|no sign of|free of)\b/;

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class LocalClinicalTerminologyProvider implements ClinicalTerminologyProvider {
  readonly name = "local-reference";

  async extractConcepts(text: string): Promise<ConceptMatch[]> {
    const lower = " " + text.toLowerCase().replace(/[’']/g, "'") + " ";
    const found = new Map<string, ConceptMatch>();
    for (const c of CONCEPTS) {
      for (const syn of c.synonyms) {
        const re = new RegExp(`(^|[^a-z])${escape(syn)}([^a-z]|$)`, "i");
        const m = re.exec(lower);
        if (!m) continue;
        const before = lower.slice(Math.max(0, m.index - 28), m.index + 1);
        const clause = before.split(/[.,;!?]|\bbut\b/).pop() ?? "";
        const negated = NEGATORS.test(clause);
        const existing = found.get(c.code);
        if (!existing || (existing.negated && !negated)) {
          found.set(c.code, { code: c.code, label: c.label, category: c.category, matchedText: syn, negated });
        }
        break;
      }
    }
    return [...found.values()];
  }

  async expandQuery(text: string): Promise<string> {
    const concepts = (await this.extractConcepts(text)).filter((c) => !c.negated);
    const extra = concepts.flatMap((c) => [c.label, ...(CONCEPTS.find((d) => d.code === c.code)?.synonyms.slice(0, 3) ?? [])]);
    return [text, ...extra].join(" ");
  }
}

/**
 * Production placeholder for a SNOMED CT / UMLS terminology server (e.g. Snowstorm, NLM UMLS API).
 * Falls back to the local reference list until CLINICAL_TERMINOLOGY_API_KEY and an endpoint are configured.
 */
export class SnomedClinicalTerminologyProvider implements ClinicalTerminologyProvider {
  readonly name = "snomed";
  private local = new LocalClinicalTerminologyProvider();
  async extractConcepts(text: string) {
    // TODO(production): call the terminology server's NLP / description search endpoint and map to SNOMED CT concept ids.
    return this.local.extractConcepts(text);
  }
  async expandQuery(text: string) {
    return this.local.expandQuery(text);
  }
}

export function getClinicalTerminology(): ClinicalTerminologyProvider {
  return env.clinicalTerminology === "snomed" && env.keys.clinicalTerminology ? new SnomedClinicalTerminologyProvider() : new LocalClinicalTerminologyProvider();
}
