import type { ConceptMatch } from "@/lib/integrations/terminology/clinical";
import { withEnglishReading } from "@/lib/clinical/lexicon";
import { regionFromText } from "./anatomy";
import type { Complaint, GuidedState } from "./types";

export interface GuidedStart {
  /** Missing when the person only says they feel unwell — the flow then starts by asking what it is. */
  complaint?: Complaint;
  bodyArea?: string | null;
  side?: "left" | "right" | null;
  symptomType?: string | null;
  /** Answers already given in the first message ("my calf is swollen after a flight"). */
  answers?: Record<string, string>;
}

/**
 * Detects a symptom complaint in free text so it can continue as a tap-to-answer flow
 * ("I have pain on the left side" → pain, side=left → "Where exactly do you feel it?").
 * Returns null for anything that isn't clearly a symptom (readings, medicines, reports…).
 */
/** A baby or an animal mentioned in free text — these use their own safety modes. */
export function mentionedSubject(text: string): "baby" | "pet" | null {
  // "Pet mein dard" is Hindi for stomach pain, not an animal.
  const t = withEnglishReading(text).toLowerCase().replace(/\b(pet|pait)\s+(mein|me|vich|ch|dard|dukh|kharab|jalan|gas)\b/g, "stomach");
  if (/\b(dog|puppy|cat|kitten|kitty|pet|rabbit|bunny|parrot)\b/.test(t)) return "pet";
  if (/\b(baby|newborn|infant)\b/.test(t)) return "baby";
  return null;
}

/** "Can I give my dog paracetamol?" — a medicine question, answered by the medication agent rather than a symptom flow. */
export function isMedicineQuestion(text: string): boolean {
  const t = withEnglishReading(text).toLowerCase();
  if (/\b(ate|eaten|swallowed|chewed)\b/.test(t)) return false;
  return /\b(can|should|could|may) (i|we|you) (give|take|use)\b|\bis it (ok|okay|safe) to (give|take)\b|\b(dose|dosage|syrup|drops|tablets?|medicines?|medication|paracetamol|ibuprofen|crocin|calpol|dolo|antibiotics?)\b/.test(t);
}

/** Best-guess baby / pet category from free text, so the first question isn't one already answered. */
export function categoryFromText(text: string, mode: "baby" | "pet"): string | null {
  const t = withEnglishReading(text).toLowerCase();
  if (/\b(ate|eaten|swallowed|poison|chocolate|grapes?|raisins?|xylitol)\b/.test(t) && mode === "pet" && !/\b(not|hasn'?t|won'?t|isn'?t)\b.*\beat/.test(t)) return "poison";
  if (/(not|isn'?t|hasn'?t|won'?t|refus\w*|stopped)\s+(\w+\s+)?(eat|eating|feed|feeding|drink\w* milk|taking milk)|poor(ly)? feed|not drinking milk/.test(t)) return mode === "baby" ? "feeding" : "not_eating";
  if (/vomit|throwing up|threw up|sick up/.test(t)) return "vomiting";
  if (/diarr|loose (motion|stool)|runny poo/.test(t)) return "diarrhoea";
  if (/breath|wheez|panting/.test(t)) return "breathing";
  if (mode === "baby" && /fever|temperature|feels hot|\bhot\b/.test(t)) return "fever";
  if (/rash|spots|itch|scratch|ear/.test(t)) return mode === "baby" ? "rash" : "skin";
  if (mode === "pet" && /limp/.test(t)) return "limping";
  if (mode === "pet" && /(pee|urin)/.test(t)) return "urine";
  if (mode === "baby" && /sleepy|won'?t wake|drowsy/.test(t)) return "sleepy";
  if (mode === "baby" && /crying|cries/.test(t)) return "crying";
  return null;
}

export function detectSymptomStart(text: string, concepts: ConceptMatch[]): GuidedStart | null {
  const t = withEnglishReading(text).toLowerCase();
  // Babies and animals start their own flows (the complaint categories differ).
  if (mentionedSubject(text)) return {};
  const present = new Set(concepts.filter((c) => !c.negated).map((c) => c.code));
  // Readings, medicine and report questions are handled by their own agents.
  if (/\d{2,3}\s*(\/|over)\s*\d{2,3}|\bmg\/?dl\b|\bmmol\b|\b(sugar|glucose|bp|blood pressure|hba1c|report|tablets?|medicines?|medication|dose|syrup)\b/.test(t)) return null;
  if (/\b(can|should|could) (i|she|he|they|we|mom|dad|my \w+) (take|give|have)\b/.test(t)) return null;
  const side: "left" | "right" | null = /\bleft\b/.test(t) ? "left" : /\bright\b(?! now| away)/.test(t) ? "right" : null;

  if (/\b(fell|fallen|had a fall|took a fall|tripped and|slipped and)\b|\bfall(s)? (down|over|in the|at home|from)\b/.test(t) && !/\bhair\b/.test(t)) return { complaint: "fall" };
  if (/\b(feel(ing)? (so |very |really )?(low|down|sad|depressed|empty|hopeless|anxious|nervous|stressed|overwhelmed)|depress(ed|ion)|anxiety|anxious|panic( attacks?)?|stressed|burn(t|ed) out|(don'?t|do not) feel (mentally |emotionally )?(well|good|okay|ok)|not (feeling )?mentally (well|ok|okay)|mentally (unwell|not well|exhausted)|sad for no reason|low mood|feeling down|grieving|grief)\b/.test(t))
    return { complaint: "mood", symptomType: /anxi|panic|nervous/.test(t) ? "anxiety" : /stress|burn|overwhelm/.test(t) ? "stress" : /grie/.test(t) ? "grief" : "low", answers: { mood_concern: /anxi|panic|nervous/.test(t) ? "anxiety" : /stress|burn|overwhelm/.test(t) ? "stress" : /grie/.test(t) ? "grief" : "low" } };
  // Pregnancy and after birth have their own check (stage first, then pregnancy-specific warning signs).
  if (/\b(i'?m|i am|she'?s|she is|currently|am) (\d{1,2} weeks? )?pregnant\b|\b\d{1,2} weeks pregnant\b|\b(postpartum|after (my |the )?(delivery|c-?section)|gave birth|since giving birth|after giving birth)\b/.test(t)) {
    const weeks = Number(t.match(/\b(\d{1,2}) weeks? pregnant/)?.[1] ?? NaN);
    const stage = /postpartum|delivery|gave birth|giving birth|c-?section/.test(t) ? "postpartum" : !Number.isNaN(weeks) ? (weeks < 12 ? "early" : weeks < 24 ? "mid" : "late") : null;
    return { complaint: "pregnancy", answers: stage ? { preg_stage: stage } : {} };
  }
  // Ear, nose and throat
  if (/\b(ear ?ache|ear (pain|infection)|ears? (hurts?|is hurting|blocked|feels? blocked)|ringing in (my )?ears?|tinnitus|hearing (loss|is muffled)|can'?t hear (properly|well))\b/.test(t)) return { complaint: "ent", answers: { ent_part: "ear" } };
  if (/\b(sinus\w*|nose ?bleeds?|nosebleed|blocked nose|stuffy nose|nose is blocked|lost (my )?sense of smell)\b/.test(t)) return { complaint: "ent", answers: { ent_part: "nose" } };
  if (present.has("sore_throat") || /\b(hoarse|lost my voice|voice (has )?(changed|gone)|tonsil\w*|painful (to )?swallow\w*|hurts to swallow)\b/.test(t)) return { complaint: "ent", answers: { ent_part: "throat" } };
  // Teeth and mouth
  if (/\b(tooth ?ache|toothache|teeth|tooth|gums?|mouth ulcers?|ulcers? in (my )?mouth|sores? in (my )?mouth)\b/.test(t))
    return { complaint: "dental", answers: { dental_issue: /\bgum/.test(t) ? "gums" : /ulcer|sore/.test(t) ? "ulcer" : "toothache" } };
  if (/\bjaw\b/.test(t) && !/\bchest\b/.test(t)) return { complaint: "dental", answers: { dental_issue: "jaw" } };
  // Urinary
  if (/\b(burning (urine|when (i )?(pee|urinate)|when passing urine|while passing urine)|burning when passing urine|pain(ful)? (when |while )?(peeing|urinating|passing urine)|peeing (a lot|often|frequently)|urinating (a lot|often|frequently)|frequent urination|blood in (my )?(urine|pee)|can'?t (pee|urinate|pass urine)|leaking urine|leak urine|urine (leak\w*|infection)|\buti\b|kidney stones?)\b/.test(t)) {
    const issue = /blood/.test(t) ? "blood" : /can'?t (pee|urinate|pass)/.test(t) ? "retention" : /leak/.test(t) ? "leaking" : /stone/.test(t) ? "colic" : /(a lot|often|frequent)/.test(t) ? "frequency" : "burning";
    return { complaint: "urinary", answers: { urine_issue: issue } };
  }
  // Sleep (plain "can't sleep" stays with the sleep advice agent)
  if (/\b(snor\w+|sleep apn(o)?ea|stop(s|ped)? breathing (at night|in (my|his|her) sleep)|restless legs|sleepy (all day|during the day)|fall(ing)? asleep (at work|while driving|during the day)|sleepwalk\w*|nightmares)\b/.test(t))
    return { complaint: "sleep", answers: { sleep_issue: /snor|apn|breathing/.test(t) ? "apnoea" : /restless/.test(t) ? "rls" : /sleepwalk|nightmare/.test(t) ? "parasomnia" : "sleepy" } };
  if (present.has("palpitations") || /\bheart\b.*\b(racing|pounding|skipping|fluttering|irregular)\b|\bpalpitation/.test(t)) return { complaint: "heart", symptomType: "palpitations" };
  if (/\b(hair (fall|loss|thinning|is falling)|losing (my )?hair|bald (patch|spot)s?)\b/.test(t)) return { complaint: "hair" };
  if (/\b(period|periods|menstrua\w*|pcos|pcod|menopause|hot flushes|hot flashes)\b/.test(t)) return { complaint: "hormones", symptomType: /menopause|hot fl/.test(t) ? "menopause" : /pcos|pcod/.test(t) ? "pcos" : "periods" };
  // Yellow eyes are a liver sign (jaundice), not an eye problem.
  if ((/\beyes?\b/.test(t) && !/\byellow\b/.test(t)) || present.has("blurred_vision")) return { complaint: "eye" };
  if (present.has("headache") || present.has("worst_headache")) return { complaint: "headache", bodyArea: "head" };
  if (present.has("chest_pain")) return { complaint: "pain", bodyArea: "chest", side };
  if (present.has("back_pain")) return { complaint: "pain", bodyArea: "back", side };
  if (present.has("abdominal_pain")) {
    const area = /\b(upper|above the navel|upper stomach)\b/.test(t) ? "upper_abdomen" : /\b(lower|below the navel|pelvi)/.test(t) ? "lower_abdomen" : null;
    return { complaint: "pain", bodyArea: area, side, symptomType: area ? null : "pain" };
  }
  if (present.has("shortness_of_breath")) return { complaint: "breathing" };
  if (present.has("fever")) return { complaint: "fever" };
  if (present.has("cough") || present.has("cold_flu")) return { complaint: "cough" };
  if (present.has("vomiting")) return { complaint: "stomach", symptomType: "vomiting" };
  if (present.has("diarrhoea")) return { complaint: "stomach", symptomType: "diarrhoea" };
  if (present.has("rash")) return { complaint: "skin", symptomType: "rash" };
  if (present.has("fatigue")) return { complaint: "weakness" };
  if (present.has("dizziness")) return { complaint: "other", symptomType: "dizziness" };

  if (/\b(acidity|heartburn|gas|bloat|constipat)/.test(t)) return { complaint: "stomach", symptomType: /constipat/.test(t) ? "constipation" : /bloat|gas/.test(t) ? "bloating" : "acidity" };

  if (/\b((whole|entire|all over my|my whole) body (hurts|aches|is aching|is paining|pain)|body ?aches?|aching all over|hurts? all over)\b/.test(t)) return { complaint: "weakness", symptomType: "aches", answers: { weakness_onset: "aches" } };
  const painWord = /\b(pain|painful|ache|aching|hurts?|hurting|sore|cramps?)\b/.test(t);
  const limbWord = /\b(swollen|swelling|numb\w*|tingl\w*|pins and needles|burning|stiff|clicks?|cracks?|makes (a )?noise|sprain\w*|twisted|cramps?)\b/.test(t);
  if ((painWord || limbWord) && !/\b(head|chest|stomach|tummy|belly|abdomen|ribs?|flank)\b/.test(t)) {
    const region = regionFromText(t);
    if (region) return { complaint: "pain", bodyArea: region.area, side, answers: region.answers };
  }
  if (painWord) {
    const area = /\bchest\b/.test(t)
      ? "chest"
      : /\b(stomach|tummy|belly|abdomen|abdominal)\b/.test(t)
        ? null
        : /\bback\b/.test(t)
          ? "back"
          : /\b(ribs?|flank)\b/.test(t)
                ? "side"
                : null;
    if (/\b(head)\b/.test(t)) return { complaint: "headache", bodyArea: "head" };
    if (/\b(ear)\b/.test(t)) return { complaint: "ent", answers: { ent_part: "ear" } };
    if (/\b(throat)\b/.test(t)) return { complaint: "ent", answers: { ent_part: "throat" } };
    if (/\b(joint)\b/.test(t)) return { complaint: "other", symptomType: "joint" };
    return { complaint: "pain", bodyArea: area, side, symptomType: /\b(stomach|tummy|belly|abdomen|abdominal)\b/.test(t) ? "pain" : null };
  }
  if (/\b(feel(ing)? (unwell|sick|ill|bad|awful|terrible)|not feeling well|i'?m sick|unwell)\b/.test(t)) return {};
  return null;
}

/** Seeds a guided state from a detected start, marking what's already known so it's never asked again. */
export function seedFromStart(state: GuidedState, start: GuidedStart): GuidedState {
  const s = { ...state };
  if (start.complaint) s.complaint = start.complaint;
  if (start.bodyArea) s.bodyArea = start.bodyArea;
  if (start.side) s.side = start.side;
  if (start.symptomType) {
    s.symptomType = start.symptomType;
    if (start.complaint === "stomach") s.answers = { ...s.answers, stomach_type: start.symptomType };
    if (start.complaint === "skin") s.answers = { ...s.answers, skin_type: start.symptomType };
    if (start.complaint === "other") s.answers = { ...s.answers, other_describe: start.symptomType };
    if (start.complaint === "heart") s.answers = { ...s.answers, heart_symptom: start.symptomType };
    if (start.complaint === "hormones") s.answers = { ...s.answers, hormone_concern: start.symptomType };
  }
  if (start.answers) s.answers = { ...s.answers, ...start.answers };
  return s;
}

/** Lipid values typed in free text ("My LDL is 172", "HDL 38 mg/dL, TG 210"). */
export function parseLipids(text: string): { ldl?: number; hdl?: number; tg?: number; total?: number; mmol: boolean } | null {
  const t = text.toLowerCase();
  if (!/\b(ldl|hdl|triglycerides?|tg|cholesterol)\b/.test(t)) return null;
  const grab = (re: RegExp) => {
    const m = t.match(re);
    return m ? Number(m[1]) : undefined;
  };
  const out = {
    ldl: grab(/\bldl\D{0,20}?(\d+(?:\.\d+)?)/),
    hdl: grab(/\bhdl\D{0,20}?(\d+(?:\.\d+)?)/),
    tg: grab(/\b(?:triglycerides?|tg)\D{0,20}?(\d+(?:\.\d+)?)/),
    total: grab(/\btotal cholesterol\D{0,20}?(\d+(?:\.\d+)?)/) ?? (/(ldl|hdl)/.test(t) ? undefined : grab(/\bcholesterol\D{0,20}?(\d+(?:\.\d+)?)/)),
    mmol: /mmol/.test(t),
  };
  return out.ldl ?? out.hdl ?? out.tg ?? out.total ? out : null;
}
