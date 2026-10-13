/**
 * Adaptive symptom questioning engine (pure, deterministic, unit-tested).
 *
 * For every answer: update state → screen for red flags → if context is missing, pick the ONE highest-value
 * next question (with tap-to-answer options) → otherwise produce a care level, a likely doctor category and
 * short guidance. Doctor categories are "who to see first", never a diagnosis.
 *
 * The red-flag rules below are conservative screening rules written for this demo. In production they must be
 * reviewed and versioned by the clinical team (like the triage patterns in `clinical_rules`).
 */
import type { CareLevel, Complaint, GuidedState, QuestionDef, StructuredAnswer } from "./types";
import { MORE_MULTI_KEYS, moreModule } from "./modules-more";
import { isRegion, regionNext, regionOutcome, regionPath, regionPhrase, regionScreen, regionSelfCare, regionWatchFor, REGION_MULTI_KEYS } from "./anatomy";
import { eyeNext, fallNext, hairNext, moodNext, modulePossibilities, heartNext, hormonesNext, MODULE_MULTI_KEYS, modulePhrase, moduleScreen, moduleSelfCare, moduleSpecialist, moduleNeedsReview, moduleWatchFor } from "./modules";

export interface PatientFacts {
  name: string;
  isSelf: boolean;
  age: number | null;
  sex: string | null;
  pregnant: boolean;
  conditions: string[];
}

export interface Outcome {
  level: CareLevel;
  speciality: string | null;
  timing: "routine" | "soon" | "urgent";
  headline: string;
  reason: string;
  summary: string[];
  selfCare: string[];
  watchFor: string[];
  /** Cautiously worded explanations to tell apart — never a diagnosis. */
  possibilities?: string[];
}

export type Decision =
  | { kind: "ask"; question: QuestionDef; lead?: string }
  | { kind: "escalate"; level: "emergency" | "urgent"; reasons: string[] }
  | { kind: "complete"; outcome: Outcome };

// ---------------------------------------------------------------------------------------------- vocabulary

/** Order = order shown to the patient. */
export const COMPLAINT_LABEL: Record<Complaint, string> = {
  pain: "Pain",
  heart: "Chest or heart",
  fever: "Fever",
  cough: "Cough or cold",
  breathing: "Breathing problem",
  stomach: "Stomach problem",
  headache: "Headache",
  skin: "Skin problem",
  eye: "Eye problem",
  weakness: "Tiredness or body aches",
  hair: "Hair loss",
  hormones: "Hormones or periods",
  fall: "A fall",
  mood: "Low mood, anxiety or stress",
  ent: "Ear, nose or throat",
  dental: "Teeth or mouth",
  urinary: "Urine problem",
  sleep: "Sleep problem",
  pregnancy: "Pregnancy or after birth",
  other: "Something else",
};

const AREA_LABEL: Record<string, string> = {
  chest: "chest",
  upper_abdomen: "upper stomach",
  lower_abdomen: "lower stomach",
  abdomen: "stomach",
  back: "back",
  side: "side / ribs",
  arm: "arm",
  leg: "leg",
  joint: "joint",
  head: "head",
  neck: "neck",
  shoulder: "shoulder",
  elbow: "elbow",
  wrist_hand: "wrist or hand",
  hip: "hip",
  knee: "knee",
  calf: "calf",
  ankle_foot: "foot or ankle",
  unsure: "body",
};

const ONSET_PHRASE: Record<string, string> = {
  today: "started today",
  "1_3_days": "has lasted a few days",
  "4_7_days": "has lasted 4–7 days",
  over_week: "has lasted more than a week",
  over_3_weeks: "has lasted more than three weeks",
  under_hour: "started within the last hour",
  hours: "started a few hours ago",
  over_3_days: "has lasted more than three days",
  "1_2_days": "has lasted a day or two",
  "3_4_days": "has lasted 3–4 days",
  "5_plus_days": "has lasted five days or more",
  under_week: "has lasted less than a week",
  "1_3_weeks": "has lasted 1–3 weeks",
  "1_4_weeks": "has lasted a few weeks",
  over_month: "has lasted more than a month",
  few_days: "has lasted a few days",
  longer: "has lasted a long time",
  under_month: "has lasted less than a month",
  "1_6_months": "has lasted 1–6 months",
  over_6_months: "has lasted more than six months",
  few_weeks: "has lasted a few weeks",
};

/** Approximate days, for thresholds. */
const ONSET_DAYS: Record<string, number> = {
  under_hour: 0,
  hours: 0,
  today: 0,
  "1_2_days": 1.5,
  "1_3_days": 2,
  few_days: 3,
  "3_4_days": 3.5,
  over_3_days: 4,
  "4_7_days": 5,
  "5_plus_days": 6,
  under_week: 4,
  over_week: 10,
  "1_3_weeks": 14,
  "1_4_weeks": 18,
  over_3_weeks: 25,
  over_month: 40,
  longer: 40,
  under_month: 14,
  few_weeks: 21,
  "1_6_months": 90,
  over_6_months: 200,
};

const NONE = { label: "None of these", value: "none", exclusive: true };
const opt = (label: string, value: string, extra: Partial<{ reply: string; hint: string; exclusive: boolean }> = {}) => ({ label, value, ...extra });

// ---------------------------------------------------------------------------------------------- answers

const SET_FIELDS: Record<string, keyof GuidedState> = {
  onset: "onset",
  headache_duration: "onset",
  fever_duration: "onset",
  cough_duration: "onset",
  breathing_onset: "onset",
  gi_duration: "onset",
  skin_duration: "onset",
  weakness_duration: "onset",
  hair_duration: "onset",
  severity: "severity",
  headache_severity: "severity",
  pain_trend: "trend",
};

const MULTI_KEYS = new Set(["chest_redflags", "abdomen_associated", "back_associated", "limb_associated", "chest_associated", "side_associated", "headache_associated", "fever_redflags", "fever_associated", "cough_associated", "breathing_associated", "gi_redflags", "skin_redflags", "wound_redflags", "weakness_associated", "aches_associated", "child_breathing", ...MODULE_MULTI_KEYS, ...REGION_MULTI_KEYS, ...MORE_MULTI_KEYS]);

/** Records a tapped (or typed-and-matched) answer into the structured state. */
export function applyAnswer(prev: GuidedState, a: StructuredAnswer): GuidedState {
  const s: GuidedState = { ...prev, answers: { ...prev.answers, [a.key]: a.value }, asked: prev.asked.includes(a.key) ? prev.asked : [...prev.asked, a.key], pending: null };
  const v = a.value;
  switch (a.key) {
    case "symptom_category":
      s.complaint = v as Complaint;
      if (v === "headache") s.bodyArea = "head";
      break;
    case "heart_symptom":
      // Chest pain uses the pain flow, whose first step is chest red-flag screening.
      if (v === "chest") {
        s.complaint = "pain";
        s.bodyArea = "chest";
      }
      break;
    case "pain_location": {
      // "knee", "left:chest", or from the body map "left:knee:back" (side : area : sub-location).
      const parts = v.split(":");
      const [side, area, spot] = parts.length === 1 ? [null, parts[0]!, null] : parts.length === 2 && !["left", "right", "centre"].includes(parts[0]!) ? [null, parts[0]!, parts[1]!] : [parts[0]!, parts[1]!, parts[2] ?? null];
      if (side === "left" || side === "right") s.side = side;
      if (area === "head") {
        s.complaint = "headache";
        s.bodyArea = "head";
      } else s.bodyArea = area;
      if (spot) s.answers = { ...s.answers, ...(spot === "heel" ? { foot_area: "heel" } : { [`${area}_spot`]: spot }) };
      break;
    }
    case "stomach_part":
      s.bodyArea = v === "upper" ? "upper_abdomen" : v === "lower" ? "lower_abdomen" : "abdomen";
      break;
    case "stomach_type":
      s.symptomType = v;
      if (v === "pain") {
        s.complaint = "pain";
        if (!s.bodyArea) s.bodyArea = null;
      }
      break;
    case "pain_character":
      s.characteristics = [v];
      break;
    case "cough_type":
    case "skin_type":
    case "weakness_onset":
    case "breathing_now":
    case "fever_temp":
      s.symptomType = a.key === "fever_temp" ? s.symptomType : v;
      if (a.key === "fever_temp") s.characteristics = [...s.characteristics.filter((c) => !c.startsWith("temp:")), `temp:${v}`];
      break;
    case "headache_sudden":
      if (v === "yes") s.redFlags = [...new Set([...s.redFlags, "Sudden, extremely severe headache"])];
      break;
    case "other_describe":
      s.symptomType = v;
      if (v === "mood") s.complaint = "mood";
      if (v === "throat" || v === "ear") {
        s.complaint = "ent";
        s.answers = { ...s.answers, ent_part: v };
      }
      if (v === "urine") s.complaint = "urinary";
      if (v === "joint") {
        s.complaint = "pain";
        s.bodyArea = "joint";
      }
      break;
    case "arm_part":
    case "leg_part":
      if (!["upper_arm", "forearm", "thigh"].includes(v)) s.bodyArea = v;
      break;
    case "limb_side":
      if (v === "left" || v === "right") s.side = v;
      break;
    case "mood_concern":
      s.symptomType = v;
      break;
    case "mood_duration":
      s.onset = v;
      break;
    default:
      break;
  }
  const field = SET_FIELDS[a.key];
  if (field) (s as unknown as Record<string, unknown>)[field] = v;
  if (MULTI_KEYS.has(a.key)) {
    const picked = v.split("|").filter((x) => x && x !== "none");
    s.associatedSymptoms = [...new Set([...s.associatedSymptoms, ...picked])];
  }
  return s;
}

// ---------------------------------------------------------------------------------------------- red flags

const has = (s: GuidedState, key: string, value: string) => (s.answers[key] ?? "").split("|").includes(value);

/** Safety screening, run after every answer. Returns an escalation that stops the normal flow. */
export function screen(s: GuidedState, f: PatientFacts): { level: "emergency" | "urgent"; reasons: string[] } | null {
  const e: string[] = [];
  const u: string[] = [];
  // Chest
  for (const [v, label] of [
    ["breathing", "Chest pain with difficulty breathing"],
    ["pressure", "Heavy pressure or tightness in the chest"],
    ["sweating", "Chest pain with sweating"],
    ["dizzy", "Chest pain with dizziness or fainting"],
    ["spreading", "Chest pain spreading to the arm, jaw or back"],
  ] as const)
    if (has(s, "chest_redflags", v)) e.push(label);
  if (s.bodyArea === "chest" && s.severity === "severe") u.push("Severe chest pain");
  if (s.bodyArea === "chest" && has(s, "chest_associated", "exertion")) u.push("Chest pain that comes on with effort");
  // Abdomen / side
  if (has(s, "abdomen_associated", "blood") || has(s, "side_associated", "blood")) u.push("Blood in vomit, stool or urine");
  if (has(s, "abdomen_associated", "black_stool")) u.push("Black or tarry stool");
  if (has(s, "abdomen_associated", "pregnant") && (has(s, "abdomen_associated", "faint") || has(s, "abdomen_associated", "shoulder_tip") || s.severity === "severe"))
    e.push("Stomach pain when you could be pregnant, with fainting, shoulder-tip pain or severe pain — an ectopic pregnancy needs ruling out now");
  else if (has(s, "abdomen_associated", "pregnant")) u.push("Stomach pain when you could be pregnant");
  if (has(s, "abdomen_associated", "vaginal_bleeding") && has(s, "abdomen_associated", "pregnant")) u.push("Stomach pain and bleeding when you could be pregnant");
  if (has(s, "abdomen_associated", "faint")) u.push("Stomach pain with feeling faint or dizzy");
  if (["upper_abdomen", "lower_abdomen", "abdomen", "side"].includes(s.bodyArea ?? "") && s.severity === "severe" && (s.onset === "today" || s.trend === "worse")) u.push("Severe stomach pain that started recently or is getting worse");
  if (s.bodyArea === "side" && has(s, "side_associated", "fever") && has(s, "side_associated", "vomiting")) u.push("Side pain with fever and vomiting");
  // Back
  if (has(s, "back_associated", "bladder")) e.push("Back pain with loss of bladder or bowel control");
  if (has(s, "back_associated", "leg_weakness")) u.push("Back pain with numbness or weakness in the legs");
  // Limbs
  if (has(s, "limb_associated", "cant_move") && has(s, "limb_associated", "injury")) u.push("Can't move or bear weight after an injury");
  if (s.bodyArea === "leg" && has(s, "limb_associated", "swelling") && has(s, "limb_associated", "red_hot")) u.push("A swollen, red and hot leg");
  if (s.bodyArea === "arm" && s.side === "left" && (has(s, "limb_associated", "numb") || s.characteristics.includes("pressure"))) u.push("Left arm pain with pressure or numbness");
  if (s.severity === "severe" && s.complaint === "pain" && !["chest"].includes(s.bodyArea ?? "") && u.length === 0 && s.trend === "worse") u.push("Severe pain that is getting worse");
  // Headache
  if (s.answers.headache_sudden === "yes") e.push("A sudden, extremely severe headache");
  for (const [v, label] of [
    ["weakness", "Headache with weakness or numbness"],
    ["confusion", "Headache with confusion or trouble speaking"],
    ["vision", "Headache with vision changes"],
  ] as const)
    if (has(s, "headache_associated", v)) e.push(label);
  if (has(s, "headache_associated", "fever") && has(s, "headache_associated", "stiff_neck")) e.push("Headache with fever and a stiff neck");
  if (has(s, "headache_associated", "injury") && has(s, "headache_associated", "vomiting")) u.push("Headache and vomiting after a head injury");
  else if (has(s, "headache_associated", "injury")) u.push("Headache after a head injury");
  // Fever
  for (const [v, label] of [
    ["breathing", "Fever with difficulty breathing"],
    ["rash", "Fever with a rash that doesn't fade when pressed"],
    ["stiff_neck", "Fever with a stiff neck or severe headache"],
    ["confusion", "Fever with confusion or unusual drowsiness"],
    ["seizure", "A fit or seizure with fever"],
  ] as const)
    if (has(s, "fever_redflags", v)) e.push(label);
  if (has(s, "fever_redflags", "dehydration")) u.push("Signs of dehydration with fever");
  if (has(s, "fever_exposure", "bite")) u.push("An animal bite or scratch — you may need a rabies vaccine today");
  const dengue = ["bleeding", "abdo", "vomiting", "lethargy"].filter((v) => has(s, "dengue_signs", v));
  if (dengue.length) u.push("Warning signs that can happen with dengue — please go to a hospital today");
  // Sepsis: any one serious sign, or two of the softer ones
  if (has(s, "fever_redflags", "mottled")) e.push("Cold, blotchy or very pale skin with fever — sepsis needs ruling out");
  const sepsisSigns = ["fast", "no_urine", "confusion"].filter((v) => has(s, "fever_redflags", v));
  if (sepsisSigns.length >= 2) e.push("Signs that can mean sepsis: fast breathing or heartbeat, little or no urine, or confusion");
  else if (has(s, "fever_redflags", "fast")) u.push("Very fast breathing or heartbeat with fever");
  else if (has(s, "fever_redflags", "no_urine")) u.push("Hasn't passed urine all day");
  if (s.complaint === "fever" && f.age != null && f.age < 0.25) u.push("Fever in a baby under 3 months");
  if (s.answers.fever_temp === "very_high") u.push("A temperature above 104°F (40°C)");
  // Cough / breathing
  if (s.answers.cough_type === "blood") u.push("Coughing up blood");
  if (has(s, "cough_associated", "chest_pain") && has(s, "cough_associated", "breathless")) u.push("Cough with chest pain and breathlessness");
  if (s.answers.breathing_now === "severe") e.push("Struggling to breathe");
  if (s.answers.breathing_now === "rest") e.push("Breathless even at rest");
  if (has(s, "breathing_associated", "chest_pain")) e.push("Breathlessness with chest pain");
  if (has(s, "breathing_associated", "blue")) e.push("Blue lips or fingertips");
  if (s.answers.breathing_onset === "sudden" && s.complaint === "breathing") u.push("Breathlessness that started suddenly");
  // Stomach (vomiting / diarrhoea etc.)
  for (const [v, label] of [
    ["blood", "Blood in vomit or stool"],
    ["no_fluids", "Unable to keep fluids down"],
    ["dehydration", "Signs of dehydration"],
    ["severe_pain", "Severe stomach pain"],
    ["swallowing", "Trouble swallowing"],
    ["black_stool", "Black or tarry stool"],
  ] as const)
    if (has(s, "gi_redflags", v)) u.push(label);
  // Skin
  if (has(s, "skin_redflags", "face_swelling")) e.push("Swelling of the lips, face or tongue");
  if (has(s, "skin_redflags", "breathing")) e.push("Skin reaction with difficulty breathing");
  if (has(s, "skin_redflags", "non_blanching")) e.push("A rash that doesn't fade when pressed");
  if (has(s, "skin_redflags", "spreading_fever")) u.push("A rash spreading quickly with fever");
  if (has(s, "skin_redflags", "blisters")) u.push("Blisters in the mouth or eyes");
  // Wounds and burns
  if (has(s, "wound_redflags", "bleeding")) e.push("Bleeding that won't stop with firm pressure");
  for (const [v, label] of [
    ["deep", "A deep or gaping wound that may need stitches"],
    ["bite", "An animal or human bite"],
    ["burn", "A large burn, or a burn on the face, hands or genitals"],
    ["infection", "Signs of infection: spreading redness, warmth or pus"],
    ["fever", "Fever after a wound"],
    ["tetanus", "A dirty wound with tetanus protection not up to date"],
  ] as const)
    if (has(s, "wound_redflags", v)) u.push(label);
  // Weakness
  if (s.answers.weakness_onset === "one_side") e.push("Sudden weakness on one side of the body");
  if (s.answers.weakness_onset === "faint") u.push("Sudden faintness or collapse");
  if (has(s, "weakness_associated", "confused")) u.push("New confusion or not acting like themselves");
  // Body aches
  if (has(s, "aches_associated", "cant_walk")) u.push("Too weak or sore to walk");
  if (has(s, "aches_associated", "rash_fever")) u.push("Body aches with fever and a rash");
  if (has(s, "aches_associated", "dark_urine")) u.push("Severe muscle pain with dark urine");
  if (has(s, "aches_associated", "breathless")) u.push("Body aches with breathlessness");
  // Joints
  if (s.bodyArea === "joint" && has(s, "limb_associated", "red_hot") && has(s, "limb_associated", "fever")) u.push("A hot, swollen joint with fever");
  if (s.bodyArea === "joint" && has(s, "limb_associated", "deformity")) u.push("A joint that looks out of shape after an injury");
  // Children with cough or breathing problems
  for (const [v, label, level] of [
    ["ribs", "Ribs or neck pulling in with each breath", "e"],
    ["grunting", "Grunting or very noisy breathing", "e"],
    ["floppy", "Very sleepy, floppy or hard to wake", "e"],
    ["fast", "Breathing much faster than usual", "u"],
    ["not_drinking", "Not drinking or few wees", "u"],
  ] as const)
    if (has(s, "child_breathing", v)) (level === "e" ? e : u).push(label);
  // Fever when the immune system is weakened
  if (s.complaint === "fever" && f.conditions.some((c) => /cancer|chemo|transplant|immun|hiv|steroid/i.test(c)) && ["mid", "high", "very_high"].includes(s.answers.fever_temp ?? "")) u.push("Fever with a weakened immune system");
  // Headache in pregnancy or soon after birth
  if (has(s, "headache_associated", "pregnant") && (has(s, "headache_associated", "vision") || s.severity === "severe")) u.push("A severe headache or vision changes in pregnancy or after giving birth");
  if (has(s, "gi_redflags", "severe_dehydration")) e.push("No urine all day, or very drowsy or confused — signs of severe dehydration");
  regionScreen(s, f, e, u);
  moduleScreen(s, f, e, u);

  if (e.length) return { level: "emergency", reasons: [...new Set(e)] };
  if (u.length) return { level: "urgent", reasons: [...new Set(u)] };
  return null;
}

// ---------------------------------------------------------------------------------------------- questions

const who = (f: PatientFacts, you: string, other: string) => (f.isSelf ? you : other.replace("{name}", f.name));
const femaleOfChildbearingAge = (f: PatientFacts) => f.sex === "female" && (f.age == null || (f.age >= 12 && f.age <= 55));

function q(key: string, text: string, style: QuestionDef["style"], options: QuestionDef["options"], extra: Partial<QuestionDef> = {}): QuestionDef {
  return { key, text, style, options, ...extra };
}

export function symptomCategoryQuestion(f: PatientFacts): QuestionDef {
  return q(
    "symptom_category",
    who(f, "What are you experiencing?", "What is {name} experiencing?"),
    "symptoms",
    (Object.keys(COMPLAINT_LABEL) as Complaint[]).filter((c) => c !== "pregnancy" || f.pregnant || femaleOfChildbearingAge(f)).map((c) => opt(COMPLAINT_LABEL[c], c)),
    { allowText: true, textPlaceholder: "Or describe it in your own words" },
  );
}

function painLocation(s: GuidedState): QuestionDef {
  const sideKnown = s.side != null;
  const limbs = [opt("Shoulder or arm", "arm"), opt("Hand or wrist", "wrist_hand"), opt("Hip or leg", "leg"), opt("Knee", "knee"), opt("Ankle or foot", "ankle_foot")];
  const options = sideKnown
    ? [opt("Chest", "chest"), opt("Upper stomach", "upper_abdomen"), opt("Lower stomach", "lower_abdomen"), opt("Back", "back"), opt("Side / ribs", "side"), opt("Neck", "neck"), ...limbs, opt("Not sure", "unsure")]
    : [
        opt("Head", "head"),
        opt("Neck", "neck"),
        opt("Left chest", "left:chest"),
        opt("Centre of chest", "chest"),
        opt("Right chest", "right:chest"),
        opt("Upper stomach", "upper_abdomen"),
        opt("Lower stomach", "lower_abdomen"),
        opt("Back", "back"),
        opt("Side / ribs", "side"),
        ...limbs,
        opt("Somewhere else / not sure", "unsure"),
      ];
  return q("pain_location", sideKnown ? "Let's narrow it down. Where exactly do you feel it?" : "Where exactly is the pain?", "body", options);
}

const onsetQ = (text = "When did it start?") => q("onset", text, "duration", [opt("Today", "today"), opt("1–3 days ago", "1_3_days"), opt("4–7 days ago", "4_7_days"), opt("More than a week ago", "over_week")]);
const severityQ = (text = "How strong is the pain right now?") =>
  q("severity", text, "scale", [
    opt("Mild", "mild", { hint: "1–3", reply: "Mild — 1 to 3" }),
    opt("Moderate", "moderate", { hint: "4–6", reply: "Moderate — 4 to 6" }),
    opt("Severe", "severe", { hint: "7–10", reply: "Severe — 7 to 10" }),
  ]);
const characterQ = () => q("pain_character", "What does the pain feel like?", "chips", [opt("Sharp", "sharp"), opt("Dull / aching", "dull"), opt("Burning", "burning"), opt("Cramping", "cramping"), opt("Pressure", "pressure"), opt("Not sure", "unsure")]);
const trendQ = () => q("pain_trend", "Is it getting better or worse?", "chips", [opt("Getting worse", "worse"), opt("About the same", "same"), opt("Getting better", "better")]);

function associatedForArea(s: GuidedState, f: PatientFacts): QuestionDef | null {
  const area = s.bodyArea;
  if (area === "chest")
    return q("chest_associated", "Do any of these apply?", "multi", [opt("Cough or fever", "cough_fever"), opt("Hurts more when pressing or moving", "musculoskeletal"), opt("Burning after meals", "reflux"), opt("Comes on with effort or exercise", "exertion"), NONE]);
  if (area === "upper_abdomen" || area === "lower_abdomen" || area === "abdomen") {
    const o = [opt("Fever", "fever"), opt("Vomiting", "vomiting"), opt("Blood in vomit or stool", "blood"), opt("Black or tarry stool", "black_stool"), opt("Burning when passing urine", "urine")];
    o.push(opt("Feeling faint or dizzy", "faint"));
    if (femaleOfChildbearingAge(f)) o.push(opt("Related to periods", "periods"), opt("Could be pregnant", "pregnant"), opt("Vaginal bleeding", "vaginal_bleeding"), opt("Pain in the tip of the shoulder", "shoulder_tip"));
    o.push(NONE);
    return q("abdomen_associated", "Are you also having any of these?", "multi", o);
  }
  if (area === "side") return q("side_associated", "Are you also having any of these?", "multi", [opt("Fever", "fever"), opt("Burning when passing urine", "urine"), opt("Blood in urine", "blood"), opt("Vomiting", "vomiting"), NONE]);
  if (area === "back") return q("back_associated", "Do any of these apply?", "multi", [opt("Numbness or weakness in the legs", "leg_weakness"), opt("Loss of bladder or bowel control", "bladder"), opt("Pain going down the leg", "sciatica"), opt("After a fall or injury", "injury"), opt("Fever", "fever"), NONE]);
  if (area === "joint")
    return q("limb_associated", "Do any of these apply?", "multi", [opt("Swollen", "swelling"), opt("Red or hot", "red_hot"), opt("Fever", "fever"), opt("Can't move it or put weight on it", "cant_move"), opt("After an injury", "injury"), opt("Looks out of shape", "deformity"), opt("Stiff in the morning", "stiffness"), NONE]);
  if (area === "arm" || area === "leg")
    return q("limb_associated", "Do any of these apply?", "multi", [opt("Swelling", "swelling"), opt("Can't move it or put weight on it", "cant_move"), opt("After an injury", "injury"), opt("Red, hot skin", "red_hot"), opt("Numbness or tingling", "numb"), NONE]);
  return null;
}

/** Picks the single most useful next question, or null when there's enough context. */
export function nextQuestion(s: GuidedState, f: PatientFacts): QuestionDef | null {
  const asked = (k: string) => s.asked.includes(k) || s.answers[k] != null;
  if (!s.complaint) return symptomCategoryQuestion(f);
  const more = moreModule(s.complaint);
  if (more) return more.next(s, f);

  switch (s.complaint) {
    case "pain": {
      if (s.symptomType === "pain" && !s.bodyArea && !asked("stomach_part")) return q("stomach_part", "Is the pain in the upper or lower part of the stomach?", "body", [opt("Upper stomach", "upper"), opt("Lower stomach", "lower"), opt("All over", "all"), opt("Not sure", "unsure")]);
      if (!s.bodyArea) return painLocation(s);
      if (s.bodyArea === "arm" && !asked("arm_part")) return q("arm_part", "Which part of the arm?", "body", [opt("Shoulder", "shoulder"), opt("Upper arm", "upper_arm"), opt("Elbow", "elbow"), opt("Forearm", "forearm"), opt("Wrist or hand", "wrist_hand")]);
      if (s.bodyArea === "leg" && !asked("leg_part")) return q("leg_part", "Which part of the leg?", "body", [opt("Hip or groin", "hip"), opt("Thigh", "thigh"), opt("Knee", "knee"), opt("Calf", "calf"), opt("Ankle or foot", "ankle_foot")]);
      if (isRegion(s.bodyArea)) return regionNext(s, f, { onset: () => onsetQ(), severity: () => severityQ(), trend: trendQ });
      if (s.bodyArea === "chest" && !asked("chest_redflags"))
        return q("chest_redflags", "Are you experiencing any of these right now?", "multi", [
          opt("Difficulty breathing", "breathing"),
          opt("Heavy pressure or tightness", "pressure"),
          opt("Sweating", "sweating"),
          opt("Dizziness or fainting", "dizzy"),
          opt("Pain spreading to arm, jaw or back", "spreading"),
          NONE,
        ]);
      if (!s.onset) return onsetQ();
      if (!s.severity) return severityQ();
      if (!asked("pain_character")) return characterQ();
      const assoc = associatedForArea(s, f);
      if (assoc && !asked(assoc.key)) return assoc;
      if (!s.trend && s.onset !== "today") return trendQ();
      return null;
    }
    case "headache": {
      if (!s.onset) return q("headache_duration", "How long have you had the headache?", "duration", [opt("Less than 1 hour", "under_hour"), opt("Several hours", "hours"), opt("1–3 days", "1_3_days"), opt("More than 3 days", "over_3_days")]);
      if (!s.severity) return q("headache_severity", "How severe is it?", "scale", [opt("Mild", "mild"), opt("Moderate", "moderate"), opt("Severe", "severe")]);
      if (!asked("headache_sudden")) return q("headache_sudden", "Did it start suddenly and become extremely painful within a minute or so?", "yesno", [opt("Yes", "yes"), opt("No", "no")]);
      if (!asked("headache_associated"))
        return q("headache_associated", "Are you also having any of these?", "multi", [
          opt("Fever", "fever"),
          opt("Stiff neck", "stiff_neck"),
          opt("Vomiting", "vomiting"),
          opt("Vision changes", "vision"),
          opt("Weakness or numbness", "weakness"),
          opt("Confusion or trouble speaking", "confusion"),
          opt("Recent head injury", "injury"),
          ...(femaleOfChildbearingAge(f) ? [opt("Pregnant or gave birth in the last 6 weeks", "pregnant")] : []),
          NONE,
        ]);
      return null;
    }
    case "fever": {
      if (!asked("fever_temp")) return q("fever_temp", "What's the highest temperature measured?", "chips", [opt("Under 100.4°F (38°C)", "low"), opt("100.4–102°F (38–39°C)", "mid"), opt("102–104°F (39–40°C)", "high"), opt("Over 104°F (40°C)", "very_high"), opt("Not measured", "unknown")]);
      if (!s.onset) return q("fever_duration", "How long has the fever lasted?", "duration", [opt("Started today", "today"), opt("1–2 days", "1_2_days"), opt("3–4 days", "3_4_days"), opt("5 days or more", "5_plus_days")]);
      if (!asked("fever_redflags"))
        return q("fever_redflags", "Are you noticing any of these?", "multi", [
          opt("Difficulty breathing", "breathing"),
          opt("Rash that doesn't fade when pressed", "rash"),
          opt("Stiff neck or severe headache", "stiff_neck"),
          opt("Confused or very drowsy", "confusion"),
          opt("Very little urine or can't keep fluids down", "dehydration"),
          opt("Cold, blotchy or very pale skin", "mottled"),
          opt("Very fast breathing or heartbeat", "fast"),
          opt("Hasn't passed urine all day", "no_urine"),
          opt("A fit or seizure", "seizure"),
          NONE,
        ]);
      if (!asked("fever_associated")) return q("fever_associated", "Any other symptoms with the fever?", "multi", [opt("Cough or sore throat", "respiratory"), opt("Body aches", "aches"), opt("Burning when passing urine", "urine"), opt("Loose motions or vomiting", "gi"), opt("Ear pain", "ear"), NONE]);
      if (!asked("fever_exposure"))
        return q("fever_exposure", "In the last few weeks, do any of these apply?", "multi", [
          opt("Mosquito bites, or dengue or malaria around you", "mosquito"),
          opt("Travelled away from home", "travel"),
          opt("Drank untreated water or ate street food", "water"),
          opt("Close contact with someone with TB or a long cough", "tb"),
          opt("An animal bite or scratch", "bite"),
          NONE,
        ]);
      if (has(s, "fever_exposure", "mosquito") && !asked("dengue_signs"))
        return q("dengue_signs", "Are you noticing any of these?", "multi", [opt("Bleeding gums or nose, or blood in vomit or stool", "bleeding"), opt("Severe tummy pain", "abdo"), opt("Vomiting again and again", "vomiting"), opt("Very tired, restless or drowsy", "lethargy"), opt("A rash", "rash"), NONE]);
      return null;
    }
    case "cough": {
      if (!s.onset) return q("cough_duration", "How long have you had the cough?", "duration", [opt("Less than a week", "under_week"), opt("1–3 weeks", "1_3_weeks"), opt("More than 3 weeks", "over_3_weeks")]);
      if (!asked("cough_type")) return q("cough_type", "What kind of cough is it?", "chips", [opt("Dry", "dry"), opt("With phlegm", "phlegm"), opt("Coughing up blood", "blood")]);
      if (!asked("cough_associated"))
        return q("cough_associated", "Are you also having any of these?", "multi", [opt("Fever", "fever"), opt("Breathlessness", "breathless"), opt("Chest pain", "chest_pain"), opt("Wheezing", "wheeze"), opt("Sore throat", "throat"), opt("Weight loss or night sweats", "weight_loss"), NONE]);
      if (has(s, "cough_associated", "breathless") && !asked("breathing_now")) return breathingNowQ();
      if (f.age != null && f.age < 13 && !asked("child_breathing"))
        return q("child_breathing", `Check ${f.name === "the child" ? "the child" : f.isSelf ? "yourself" : f.name} for a moment. Do you notice any of these?`, "multi", [opt("Breathing much faster than usual", "fast"), opt("Ribs or neck pulling in with each breath", "ribs"), opt("Grunting or very noisy breathing", "grunting"), opt("Not drinking or few wees", "not_drinking"), opt("Very sleepy, floppy or hard to wake", "floppy"), NONE]);
      return null;
    }
    case "breathing": {
      if (!asked("breathing_now")) return breathingNowQ();
      if (!s.onset) return q("breathing_onset", "When did it start?", "duration", [opt("Suddenly, today", "sudden"), opt("Over a few days", "few_days"), opt("Weeks or longer", "longer")]);
      if (!asked("breathing_associated"))
        return q("breathing_associated", "Do any of these apply?", "multi", [opt("Chest pain", "chest_pain"), opt("Lips or fingertips look blue", "blue"), opt("Swelling in the legs", "leg_swelling"), opt("Fever or cough", "infection"), opt("Known asthma or COPD", "asthma"), NONE]);
      return null;
    }
    case "stomach": {
      if (!asked("stomach_type"))
        return q("stomach_type", "What's the main problem?", "chips", [opt("Stomach pain", "pain"), opt("Vomiting", "vomiting"), opt("Loose motions", "diarrhoea"), opt("Acidity / heartburn", "acidity"), opt("Constipation", "constipation"), opt("Bloating or gas", "bloating")]);
      if (!s.onset) return q("gi_duration", "How long has this been going on?", "duration", [opt("Started today", "today"), opt("1–2 days", "1_2_days"), opt("3–7 days", "4_7_days"), opt("More than a week", "over_week")]);
      if (!asked("gi_redflags")) {
        const acute = ["vomiting", "diarrhoea"].includes(s.symptomType ?? "");
        return q(
          "gi_redflags",
          "Are you noticing any of these?",
          "multi",
          acute
            ? [opt("Blood in vomit or stool", "blood"), opt("Can't keep fluids down", "no_fluids"), opt("Very little urine or very thirsty", "dehydration"), opt("No urine all day, or very drowsy or confused", "severe_dehydration"), opt("Severe stomach pain", "severe_pain"), opt("High fever", "fever"), NONE]
            : [opt("Trouble swallowing", "swallowing"), opt("Losing weight without trying", "weight_loss"), opt("Black or tarry stool", "black_stool"), opt("Repeated vomiting", "vomiting"), NONE],
        );
      }
      return null;
    }
    case "skin": {
      if (!asked("skin_type")) return q("skin_type", "What does it look like?", "chips", [opt("Rash", "rash"), opt("Itching", "itching"), opt("Swelling", "swelling"), opt("Spots or acne", "acne"), opt("Wound or burn", "wound"), opt("Something else", "other")]);
      if (s.answers.skin_type === "wound" && !asked("wound_redflags"))
        return q("wound_redflags", "About the wound — do any of these apply?", "multi", [
          opt("Still bleeding after 10 minutes of firm pressure", "bleeding"),
          opt("Deep, gaping or you can see fat or bone", "deep"),
          opt("Animal or human bite", "bite"),
          opt("A burn bigger than the palm, or on face, hands or genitals", "burn"),
          opt("Spreading redness, warmth or pus", "infection"),
          opt("Fever since the wound", "fever"),
          opt("Dirty wound and tetanus jab not up to date", "tetanus"),
          NONE,
        ]);
      if (s.answers.skin_type !== "wound" && !asked("skin_redflags"))
        return q("skin_redflags", "Are you noticing any of these?", "multi", [
          opt("Swelling of lips, face or tongue", "face_swelling"),
          opt("Difficulty breathing", "breathing"),
          opt("Rash that doesn't fade when pressed", "non_blanching"),
          opt("Spreading quickly, with fever", "spreading_fever"),
          opt("Blisters in the mouth or eyes", "blisters"),
          NONE,
        ]);
      if (!s.onset) return q("skin_duration", "How long has it been there?", "duration", [opt("Started today", "today"), opt("A few days", "few_days"), opt("1–4 weeks", "1_4_weeks"), opt("Longer", "longer")]);
      return null;
    }
    case "weakness": {
      if (!asked("weakness_onset"))
        return q("weakness_onset", "What best describes it?", "chips", [opt("Sudden weakness on one side of the body", "one_side"), opt("Suddenly felt faint or collapsed", "faint"), opt("Aching all over", "aches"), opt("Weaker over days or weeks", "gradual"), opt("Just generally tired", "tired")]);
      if (s.answers.weakness_onset === "aches" && !asked("aches_associated"))
        return q("aches_associated", "Do any of these apply?", "multi", [opt("Fever or a recent infection", "infection"), opt("Hard exercise or physical work recently", "exertion"), opt("Too weak or sore to walk", "cant_walk"), opt("Fever with a rash", "rash_fever"), opt("Dark, cola-coloured urine", "dark_urine"), opt("Breathless", "breathless"), opt("Swollen joints", "joints"), NONE]);
      if (!s.onset) return q("weakness_duration", "How long has it been going on?", "duration", [opt("Less than a week", "under_week"), opt("1–4 weeks", "1_4_weeks"), opt("More than a month", "over_month")]);
      if (!asked("weakness_associated"))
        return q("weakness_associated", "Do any of these apply?", "multi", [opt("Weight loss", "weight_loss"), opt("Very thirsty or passing urine often", "thirst"), opt("Low mood or poor sleep", "mood"), opt("Breathless on activity", "breathless"), opt("Heavy periods", "periods"), opt("Fever", "fever"), ...(f.age != null && f.age >= 65 ? [opt("Confused or not acting like themselves", "confused")] : []), NONE]);
      return null;
    }
    case "heart":
      return heartNext(s, f);
    case "eye":
      return eyeNext(s);
    case "hair":
      return hairNext(s, f);
    case "hormones":
      return hormonesNext(s, f);
    case "fall":
      return fallNext(s, f);
    case "mood":
      return moodNext(s, f);
    case "other": {
      if (!asked("other_describe"))
        return q("other_describe", "Tell me a little more. Is it one of these?", "chips", [opt("Dizziness", "dizziness"), opt("Sore throat", "throat"), opt("Ear pain", "ear"), opt("Eye problem", "eye"), opt("Urine problem", "urine"), opt("Joint pain", "joint"), opt("Anxiety or low mood", "mood")], { allowText: true, textPlaceholder: "Describe it in a few words" });
      if (!s.onset) return onsetQ("When did it start?");
      if (!s.severity) return severityQ("How much is it bothering you?");
      return null;
    }
  }
  return null;
}

function breathingNowQ() {
  return q("breathing_now", "How is the breathing right now?", "chips", [
    opt("Struggling to breathe or can't finish sentences", "severe"),
    opt("Breathless even at rest", "rest"),
    opt("Breathless only with activity", "activity"),
    opt("Wheezy or tight chest", "wheeze"),
  ]);
}

// ---------------------------------------------------------------------------------------------- outcome

const GP = "General Physician";

/** Who to see first, and why. Children see a Paediatrician first. */
function specialistFor(s: GuidedState, f: PatientFacts): { speciality: string; reason: string } {
  const days = ONSET_DAYS[s.onset ?? ""] ?? 0;
  const child = f.age != null && f.age < 14;
  const pick = (speciality: string, reason: string) => (child ? { speciality: "Paediatrician", reason: `A Paediatrician is the right first doctor for a child. ${reason}` } : { speciality, reason });
  const assoc = (v: string) => s.associatedSymptoms.includes(v);
  if (s.complaint === "pain" && isRegion(s.bodyArea)) {
    const r = regionOutcome(s, f).specialist;
    return pick(r.speciality, r.reason);
  }
  const mod = moduleSpecialist(s, f);
  if (mod) return pick(mod.speciality, mod.reason);

  switch (s.complaint) {
    case "pain":
      if (s.bodyArea === "joint") return pick(assoc("stiffness") || assoc("swelling") ? "Rheumatologist" : "Orthopaedic Doctor", assoc("stiffness") || assoc("swelling") ? "A Rheumatologist commonly evaluates swollen joints and morning stiffness." : "An Orthopaedic doctor commonly evaluates joint pain, especially after an injury.");
      if (s.bodyArea === "upper_abdomen" && (days >= 7 || s.characteristics.includes("burning") || assoc("reflux"))) return pick("Gastroenterologist", "This type of specialist commonly evaluates persistent upper-abdominal pain.");
      if ((s.bodyArea === "lower_abdomen" || s.bodyArea === "abdomen") && assoc("periods")) return pick("Gynaecologist", "A Gynaecologist commonly evaluates lower-abdominal pain linked to periods.");
      if (["lower_abdomen", "abdomen", "upper_abdomen"].includes(s.bodyArea ?? "") && days >= 14) return pick("Gastroenterologist", "This type of specialist commonly evaluates long-lasting stomach pain.");
      if (s.bodyArea === "side" && (assoc("urine") || assoc("blood"))) return pick("Urologist", "A Urologist commonly evaluates side pain with urinary symptoms.");
      if (s.bodyArea === "back" && (days >= 7 || assoc("sciatica"))) return pick("Orthopaedic Doctor", "An Orthopaedic doctor commonly evaluates back pain that lasts or spreads down the leg.");
      if ((s.bodyArea === "arm" || s.bodyArea === "leg") && (assoc("injury") || days >= 7)) return pick("Orthopaedic Doctor", "An Orthopaedic doctor commonly evaluates limb pain after an injury or that doesn't settle.");
      if (s.bodyArea === "chest" && (s.characteristics.includes("pressure") || assoc("exertion"))) return pick("Cardiologist", "A Cardiologist commonly evaluates chest pressure or chest pain brought on by effort.");
      return pick(GP, "A General Physician would be a good starting point to examine you and decide if any tests are needed.");
    case "headache":
      if (days >= 4 || s.severity === "severe") return pick("Neurologist", "A Neurologist commonly evaluates headaches that are severe or keep coming back. A General Physician is also a good first step.");
      return pick(GP, "A General Physician would be a good starting point for a headache that isn't settling.");
    case "fever":
      return pick(GP, "A General Physician is the right first doctor for a fever that lasts or comes with other symptoms.");
    case "cough":
      if (days >= 21 || assoc("weight_loss")) return pick("Pulmonologist", "A Pulmonologist (chest specialist) commonly evaluates a cough lasting more than three weeks.");
      if (assoc("throat") && days >= 7) return pick("ENT Specialist", "An ENT specialist commonly evaluates a persistent sore throat and cough.");
      return pick(GP, "A General Physician would be a good starting point for a cough that isn't settling.");
    case "breathing":
      if (assoc("asthma") || s.answers.breathing_now === "wheeze") return pick("Pulmonologist", "A Pulmonologist (chest specialist) commonly helps with wheezing and asthma control.");
      return pick(GP, "A General Physician should check breathlessness and decide if any tests are needed.");
    case "stomach":
      if (["acidity", "constipation", "bloating"].includes(s.symptomType ?? "") && days >= 7) return pick("Gastroenterologist", "A Gastroenterologist commonly evaluates ongoing acidity, bloating or bowel changes.");
      return pick(GP, "A General Physician would be a good starting point for stomach symptoms that aren't settling.");
    case "skin":
      return pick("Dermatologist", "A Dermatologist specialises in skin rashes, itching and spots.");
    case "weakness":
      if (assoc("thirst")) return pick("Diabetologist", "Thirst and passing urine often can be checked with a simple sugar test — a Diabetologist or General Physician can arrange it.");
      return pick(GP, "A General Physician can look for common causes of tiredness, often with a simple blood test.");
    case "other":
      if (s.symptomType === "ear" || s.symptomType === "throat") return pick(days >= 7 ? "ENT Specialist" : GP, days >= 7 ? "An ENT specialist commonly evaluates ear and throat problems that persist." : "A General Physician would be a good starting point.");
      if (s.symptomType === "eye") return pick("Ophthalmologist", "An Ophthalmologist (eye doctor) is the right specialist for eye problems.");
      if (s.symptomType === "nails") return pick("Dermatologist", "A Dermatologist commonly evaluates nail changes.");
      if (s.symptomType === "joint") return pick("Orthopaedic Doctor", "An Orthopaedic doctor commonly evaluates joint pain.");
      if (s.symptomType === "mood") return pick(GP, "A General Physician can talk this through and suggest support, or refer you to a mental health professional.");
      return pick(GP, "A General Physician would be a good starting point.");
  }
  return pick(GP, "A General Physician would be a good starting point.");
}

export function complaintPhrase(s: GuidedState): string {
  if (s.complaint === "pain" && isRegion(s.bodyArea)) return regionPhrase(s);
  const mod = modulePhrase(s);
  if (mod) return mod;
  if (s.complaint === "weakness" && s.answers.weakness_onset === "aches") return "body aches";
  if (s.complaint === "pain") {
    const area = AREA_LABEL[s.bodyArea ?? ""] ?? "body";
    return s.bodyArea && s.bodyArea !== "unsure" ? `${s.side ? `${s.side}-side ` : ""}${area} pain` : "pain";
  }
  if (s.complaint === "stomach") return ({ vomiting: "vomiting", diarrhoea: "loose motions", acidity: "acidity", constipation: "constipation", bloating: "bloating" } as Record<string, string>)[s.symptomType ?? ""] ?? "stomach problem";
  if (s.complaint === "skin") return s.symptomType === "rash" ? "skin rash" : s.symptomType === "itching" ? "itching" : "skin problem";
  if (s.complaint === "weakness") return "tiredness and weakness";
  if (s.complaint === "breathing") return "breathing problem";
  if (s.complaint === "other") return ({ dizziness: "dizziness", throat: "sore throat", ear: "ear pain", eye: "eye problem", nails: "nail changes", urine: "urine problem", joint: "joint pain", mood: "anxiety or low mood" } as Record<string, string>)[s.symptomType ?? ""] ?? "symptom";
  return s.complaint ?? "symptom";
}

function vulnerable(f: PatientFacts) {
  return (f.age != null && (f.age < 5 || f.age >= 65)) || f.pregnant || f.conditions.some((c) => /diabet|heart|kidney|copd|asthma|cancer|immun/i.test(c));
}

function selfCareFor(s: GuidedState): string[] {
  if (s.complaint === "pain" && isRegion(s.bodyArea)) return regionSelfCare(s);
  const mod = moduleSelfCare(s);
  if (mod) return mod;
  if (s.complaint === "pain" && s.bodyArea === "joint") return ["Rest the joint and avoid what makes it worse", "A cold pack wrapped in cloth for 15 minutes can ease swelling", "Gentle movement helps stiffness once the pain settles"];
  if (s.complaint === "weakness" && s.answers.weakness_onset === "aches") return ["Rest and drink plenty of fluids", "A warm bath or gentle stretching can ease aches", "Use a pain reliever only if it usually suits you, following the label"];
  if (s.complaint === "skin" && s.answers.skin_type === "wound") return ["Rinse the wound gently with clean running water", "Press firmly with a clean cloth to stop bleeding", "Cover with a clean, dry dressing and change it daily", "For a burn, cool it under running water for 20 minutes; don't use ice, butter or toothpaste"];
  switch (s.complaint) {
    case "pain":
      if (s.bodyArea === "upper_abdomen" || s.bodyArea === "abdomen" || s.bodyArea === "lower_abdomen")
        return ["Eat small, plain meals and avoid spicy, oily food for now", "Sip water regularly", "Avoid painkillers like ibuprofen on an empty stomach", "Note when the pain comes and what makes it better or worse"];
      if (s.bodyArea === "back") return ["Keep gently moving — short walks help more than bed rest", "A warm compress can ease stiffness", "Avoid heavy lifting for a few days"];
      if (s.bodyArea === "arm" || s.bodyArea === "leg") return ["Rest the area and raise it if swollen", "A cold pack wrapped in cloth for 15 minutes can help", "Avoid activities that make it worse"];
      return ["Rest and avoid what makes the pain worse", "Note when it comes on and how long it lasts", "Use a pain reliever only if it usually suits you, following the label"];
    case "headache":
      return ["Drink water and rest in a quiet, dim room", "Take regular meals and avoid skipping sleep", "Limit screen time for a while", "Use a pain reliever only if it usually suits you, following the label"];
    case "fever":
      return ["Rest and drink plenty of fluids", "Wear light clothing and keep the room cool", "Paracetamol can ease discomfort if it suits you — follow the label", "Check the temperature every few hours"];
    case "cough":
      return ["Warm fluids, honey in warm water (not for babies under 1) and steam can soothe", "Avoid smoke and dust", "Rest your voice and sleep with your head slightly raised"];
    case "breathing":
      return ["Sit upright and rest", "If you have an inhaler prescribed, use it as directed", "Avoid smoke, dust and strong smells"];
    case "stomach":
      if (s.symptomType === "vomiting" || s.symptomType === "diarrhoea") return ["Take small, frequent sips of ORS or water", "Eat light foods like rice, banana or toast when you feel able", "Wash hands often to avoid spreading infection"];
      if (s.symptomType === "acidity") return ["Eat smaller meals and avoid lying down for 2–3 hours after eating", "Cut down on spicy, fried food, tea and coffee", "Raise the head of your bed slightly"];
      return ["Drink plenty of water", "Include fibre like fruit, vegetables and whole grains", "A short walk after meals can help"];
    case "skin":
      return ["Keep the area clean and dry", "Avoid scratching — a cool compress can ease itching", "Use mild, fragrance-free soap and moisturiser", "Stop any new cream or product that may have caused it"];
    case "weakness":
      return ["Aim for regular sleep and meals", "Drink enough water through the day", "Gentle activity like a daily walk can improve energy"];
    default:
      return ["Rest, drink fluids and note any changes", "Keep track of when symptoms come and go"];
  }
}

function watchForFor(s: GuidedState): string[] {
  if (s.complaint === "pain" && isRegion(s.bodyArea)) return regionWatchFor(s);
  const mod = moduleWatchFor(s);
  if (mod) return mod;
  switch (s.complaint) {
    case "pain":
      if (s.bodyArea === "chest") return ["Pain spreading to the arm, jaw or back", "Difficulty breathing, sweating or feeling faint", "Pain that becomes heavy or crushing"];
      if (s.bodyArea === "back") return ["Numbness or weakness in the legs", "Loss of bladder or bowel control", "Fever with back pain"];
      return ["Pain that becomes severe or keeps getting worse", "Vomiting blood or black stools", "High fever, or a hard, swollen stomach"];
    case "headache":
      return ["A sudden, very severe headache", "Weakness, numbness, confusion or trouble speaking", "Fever with a stiff neck", "Vision changes"];
    case "fever":
      return ["Difficulty breathing", "A rash that doesn't fade when pressed", "Stiff neck, confusion or unusual drowsiness", "Very little urine"];
    case "cough":
    case "breathing":
      return ["Struggling to breathe or lips turning blue", "Chest pain", "Coughing up blood"];
    case "stomach":
      return ["Blood in vomit or stool", "Unable to keep fluids down", "Very little urine, dizziness or extreme thirst", "Severe stomach pain"];
    case "skin":
      return ["Swelling of the lips, face or tongue", "Difficulty breathing", "A rash spreading quickly with fever"];
    case "weakness":
      return ["Sudden weakness on one side, slurred speech or a drooping face", "Fainting", "Chest pain or breathlessness"];
    default:
      return ["Symptoms getting quickly worse", "Difficulty breathing, chest pain or fainting"];
  }
}

/** Decides the care level once enough context is collected. */
export function outcome(s: GuidedState, f: PatientFacts): Outcome {
  const days = ONSET_DAYS[s.onset ?? ""] ?? 0;
  const phrase = complaintPhrase(s);
  const onsetText = ONSET_PHRASE[s.onset ?? ""];
  const { speciality, reason } = specialistFor(s, f);
  // Modules (heart, eye, hair, hormones) decide review themselves rather than by duration alone.
  const threshold: Record<Complaint, number> = { pain: 2, heart: 9999, headache: 3, fever: 3, cough: 14, breathing: 0, stomach: 2, skin: 7, eye: 9999, weakness: 14, hair: 9999, hormones: 9999, fall: 9999, mood: 9999, ent: 9999, dental: 9999, urinary: 9999, sleep: 9999, pregnancy: 9999, other: 3 };
  const reasons: string[] = [];
  const region = s.complaint === "pain" && isRegion(s.bodyArea) ? regionOutcome(s, f) : null;
  const moduleReason = region ? region.review : moduleNeedsReview(s, f);
  if (moduleReason) reasons.push(moduleReason);
  // Body-region pain decides review itself: a few days of an overuse ache is usually fine to self-manage.
  if (!region && s.complaint && days >= threshold[s.complaint]) reasons.push(onsetText ? `it ${onsetText}` : "it has lasted a while");
  if (!region && s.severity === "severe") reasons.push("it's severe");
  else if (!region && s.severity === "moderate" && s.trend === "worse") reasons.push("it's moderate and getting worse");
  if (!region && s.trend === "worse" && s.severity !== "moderate") reasons.push("it's getting worse");
  if (s.complaint === "breathing") reasons.push("breathlessness should always be checked");
  if (s.complaint === "skin" && s.symptomType !== "acne") reasons.push("a doctor can look at it directly");
  if (s.complaint === "fever" && (s.answers.fever_temp === "high" || s.associatedSymptoms.includes("urine"))) reasons.push(s.associatedSymptoms.includes("urine") ? "burning urine with fever may need treatment" : "the temperature is high");
  if (s.complaint === "pain" && s.bodyArea === "chest") reasons.push("chest pain is worth checking even without warning signs");
  if (s.complaint === "weakness" && s.associatedSymptoms.some((a) => ["weight_loss", "thirst", "breathless", "periods"].includes(a))) reasons.push("some of the symptoms you mentioned are worth testing for");
  if (s.associatedSymptoms.includes("weight_loss")) reasons.push("unplanned weight loss should be checked");
  // Checks with their own review rules (body regions, mood, pregnancy, teeth, sleep, urine) decide this themselves.
  if (!region && !["mood", "pregnancy", "dental", "sleep", "urinary"].includes(s.complaint ?? "") && vulnerable(f)) reasons.push(f.pregnant ? "pregnancy means a lower threshold for check-ups" : f.age != null && f.age >= 65 ? "age means a lower threshold for check-ups" : f.age != null && f.age < 5 ? "young children should be checked sooner" : "existing health conditions mean a lower threshold for check-ups");

  const needsDoctor = reasons.length > 0;
  const level: CareLevel = !needsDoctor ? "self_care" : speciality === GP || speciality === "Paediatrician" ? "routine" : "specialist";
  const timing: Outcome["timing"] = s.severity === "severe" || s.trend === "worse" || (s.complaint === "pain" && s.bodyArea === "chest") || s.complaint === "breathing" ? "soon" : "routine";

  const summary: string[] = [];
  summary.push(`${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}${onsetText ? ` — ${onsetText}` : ""}`);
  const path = regionPath(s);
  if (path) summary.push(`Location: ${path}`);
  if (s.severity) summary.push(`Severity: ${s.severity}`);
  if (s.characteristics.filter((c) => !c.startsWith("temp:")).length) summary.push(`Feels: ${s.characteristics.filter((c) => !c.startsWith("temp:")).join(", ")}`);
  if (s.trend) summary.push(`Trend: ${s.trend === "worse" ? "getting worse" : s.trend === "better" ? "getting better" : "about the same"}`);
  summary.push("No emergency warning signs reported");

  const subjectWas = f.isSelf ? "you've" : `you've told me about ${f.name}, and`;
  const headline = needsDoctor
    ? `Based on what ${f.isSelf ? "you've told me" : `you've told me about ${f.name}`}, this doesn't appear to show the emergency signs I checked for, but because ${reasons.slice(0, 2).join(" and ")}, speaking with ${/^[AEIOU]/.test(speciality) ? "an" : "a"} ${speciality} would be sensible.`
    : `Based on what ${subjectWas === "you've" ? "you've told me" : `you've told me about ${f.name}`}, this doesn't appear to show the emergency signs I checked for, and it sounds like something that can usually be managed at home for now.`;

  return {
    level,
    speciality: needsDoctor ? speciality : null,
    timing,
    headline,
    reason,
    summary,
    selfCare: selfCareFor(s),
    watchFor: watchForFor(s),
    possibilities: region?.possibilities ?? modulePossibilities(s, f) ?? undefined,
  };
}

/** One step of the engine: screening first, then the next question, then the outcome. */
export function decide(s: GuidedState, f: PatientFacts): Decision {
  const flag = screen(s, f);
  if (flag) return { kind: "escalate", ...flag };
  const question = nextQuestion(s, f);
  if (question) return { kind: "ask", question };
  return { kind: "complete", outcome: outcome(s, f) };
}

/** Matches typed text to one of a question's options (so typing "today" answers a duration question). */
export function matchTypedAnswer(question: Pick<QuestionDef, "options" | "style">, text: string): { value: string; label: string } | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (!t) return null;
  if (question.style === "yesno") {
    if (/^(yes|yeah|yep|y|haan|ha)\b/.test(t)) return { value: "yes", label: "Yes" };
    if (/^(no|nope|nah|n|nahi)\b/.test(t)) return { value: "no", label: "No" };
  }
  if (question.style === "multi" && /^(none|no|nothing|none of these|nope)\b/.test(t)) return { value: "none", label: "None of these" };
  if (question.style === "scale") {
    const n = t.match(/\b(10|[1-9])\b/);
    if (n) {
      const v = Number(n[1]);
      const opt = question.options[v <= 3 ? 0 : v <= 6 ? 1 : 2];
      if (opt) return { value: opt.value, label: opt.reply ?? opt.label };
    }
  }
  const exact = question.options.find((o) => o.label.toLowerCase() === t || o.value.toLowerCase() === t);
  if (exact) return { value: exact.value, label: exact.reply ?? exact.label };
  const partial = question.options.filter((o) => {
    const words = o.label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    return words.length > 0 && words.some((w) => t.includes(w));
  });
  if (question.style === "multi" && partial.length) return { value: partial.map((o) => o.value).join("|"), label: partial.map((o) => o.label).join(", ") };
  if (partial.length === 1) return { value: partial[0]!.value, label: partial[0]!.reply ?? partial[0]!.label };
  return null;
}
