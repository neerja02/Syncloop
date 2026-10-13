/**
 * Phase 2 symptom modules: heart, eyes, hair, hormones & periods. Each module supplies the next question,
 * red-flag rules, who to see first, self-care and warning signs. Same principles as the core engine:
 * triage before advice, one question at a time, categories of care rather than diagnoses.
 * Demo content — requires clinical review before production use.
 */
import type { GuidedState, QuestionDef } from "./types";
import { moreModule } from "./modules-more";

export interface ModuleFacts {
  name: string;
  isSelf: boolean;
  age: number | null;
  sex: string | null;
  pregnant: boolean;
  conditions: string[];
}

const opt = (label: string, value: string, extra: Partial<{ reply: string; hint: string; exclusive: boolean }> = {}) => ({ label, value, ...extra });
const NONE = { label: "None of these", value: "none", exclusive: true };
const q = (key: string, text: string, style: QuestionDef["style"], options: QuestionDef["options"], extra: Partial<QuestionDef> = {}): QuestionDef => ({ key, text, style, options, ...extra });
const has = (s: GuidedState, key: string, v: string) => (s.answers[key] ?? "").split("|").includes(v);
const asked = (s: GuidedState, k: string) => s.answers[k] != null;
const femaleOfChildbearingAge = (f: ModuleFacts) => f.sex === "female" && (f.age == null || (f.age >= 12 && f.age <= 55));
const knownHeart = (f: ModuleFacts) => f.conditions.some((c) => /heart|cardiac|angina|arrhythm|atrial|coronary/i.test(c));

export const MODULE_MULTI_KEYS = ["fever_exposure", "dengue_signs", "mood_signs", "fall_redflags", "palp_redflags", "heart_risks", "breathless_signs", "eye_redflags", "eye_symptoms", "hair_context", "hormone_signs", "period_redflags"];

// ------------------------------------------------------------------------------------------------- heart

export function heartNext(s: GuidedState, f: ModuleFacts): QuestionDef | null {
  if (!asked(s, "heart_symptom"))
    return q("heart_symptom", "What are you noticing?", "chips", [
      opt("Chest pain, pressure or tightness", "chest"),
      opt("Heart racing, pounding or skipping", "palpitations"),
      opt("Breathless on effort or swollen ankles", "breathless"),
      opt("Worried about heart risk", "risk"),
    ]);
  const t = s.answers.heart_symptom;
  if (t === "palpitations") {
    if (!asked(s, "palp_redflags"))
      return q("palp_redflags", "Are any of these happening with it?", "multi", [opt("Fainting or nearly fainting", "faint"), opt("Chest pain or pressure", "chest_pain"), opt("Short of breath", "breathless"), opt("Racing right now for more than 15 minutes", "sustained"), NONE]);
    if (!asked(s, "palp_pattern")) return q("palp_pattern", "How often does it happen?", "chips", [opt("Just once", "once"), opt("Comes and goes", "recurrent"), opt("Most days", "daily")]);
    if (!asked(s, "palp_trigger")) return q("palp_trigger", "Does anything seem to bring it on?", "chips", [opt("Tea, coffee or energy drinks", "caffeine"), opt("Stress or anxiety", "stress"), opt("Exercise", "exercise"), opt("Not sure", "unsure")]);
    return null;
  }
  if (t === "breathless") {
    if (!asked(s, "breathless_signs"))
      return q("breathless_signs", "Do any of these apply?", "multi", [opt("Breathless lying flat or waking up breathless", "orthopnoea"), opt("Ankles or legs newly swollen", "oedema"), opt("Chest pain or pressure with effort", "angina"), opt("Breathless even at rest", "rest"), NONE]);
    if (!s.onset) return q("onset", "When did this start?", "duration", [opt("Today", "today"), opt("1–3 days ago", "1_3_days"), opt("4–7 days ago", "4_7_days"), opt("More than a week ago", "over_week")]);
    return null;
  }
  if (t === "risk") {
    if (!asked(s, "heart_risks"))
      return q("heart_risks", `Which of these apply to ${f.isSelf ? "you" : f.name}?`, "multi", [opt("High blood pressure", "bp"), opt("Diabetes", "diabetes"), opt("High cholesterol", "cholesterol"), opt("Smoking", "smoking"), opt("Parent or sibling with heart disease before 55–65", "family"), opt("Overweight or inactive", "lifestyle"), NONE]);
    return null;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------- eyes

export function eyeNext(s: GuidedState): QuestionDef | null {
  if (!asked(s, "eye_redflags"))
    return q("eye_redflags", "First, has any of this happened?", "multi", [
      opt("Chemical or cleaning product in the eye", "chemical"),
      opt("Injury, or something hit or went into the eye", "injury"),
      opt("Sudden loss or blurring of vision", "vision_loss"),
      opt("Flashes, new floaters or a curtain over vision", "detachment"),
      opt("Severe eye pain with headache or vomiting", "severe_pain"),
      NONE,
    ]);
  if (!asked(s, "eye_which")) return q("eye_which", "One eye or both?", "chips", [opt("One eye", "one"), opt("Both eyes", "both")]);
  if (!asked(s, "eye_symptoms"))
    return q("eye_symptoms", "What are you noticing?", "multi", [opt("Redness", "red"), opt("Sticky discharge", "discharge"), opt("Itching or watering", "itch"), opt("Pain or light hurts", "photophobia"), opt("Feels like something is in it", "foreign_body"), opt("Blurred vision", "blurred"), opt("I wear contact lenses", "lenses")]);
  if (!s.onset) return q("onset", "When did it start?", "duration", [opt("Today", "today"), opt("1–3 days ago", "1_3_days"), opt("4–7 days ago", "4_7_days"), opt("More than a week ago", "over_week")]);
  return null;
}

// ------------------------------------------------------------------------------------------------- hair

export function hairNext(s: GuidedState, f: ModuleFacts): QuestionDef | null {
  if (!asked(s, "hair_pattern"))
    return q("hair_pattern", "What kind of hair loss is it?", "chips", [opt("Overall thinning or more shedding", "diffuse"), opt("Round bald patches", "patchy"), opt("Receding hairline or crown", "pattern"), opt("Hair breaking", "breakage"), opt("Itchy or scaly scalp too", "scalp")]);
  if (!s.onset) return q("hair_duration", "How long has it been happening?", "duration", [opt("A few weeks", "few_weeks"), opt("1–6 months", "1_6_months"), opt("More than 6 months", "over_6_months")]);
  if (!asked(s, "hair_context")) {
    const o = [opt("Illness or high fever in the last 3 months", "illness"), opt("Major stress or surgery recently", "stress"), opt("Big weight loss or diet change", "diet"), opt("Started a new medicine", "medicine"), opt("Thyroid problem or tiredness", "thyroid")];
    if (f.sex === "female") o.push(opt("Had a baby in the last 6 months", "postpartum"), opt("Periods irregular or very heavy", "periods"));
    o.push(NONE);
    return q("hair_context", "Do any of these apply?", "multi", o);
  }
  return null;
}

// ------------------------------------------------------------------------------------------------- hormones & periods

export function hormonesNext(s: GuidedState, f: ModuleFacts): QuestionDef | null {
  if (!asked(s, "hormone_concern")) {
    const o = [opt("Thyroid symptoms", "thyroid"), opt("Unexplained weight change", "weight"), opt("Low energy or mood", "energy")];
    if (f.sex !== "male") o.unshift(opt("Periods irregular, heavy or stopped", "periods"), opt("Excess hair, acne or PCOS worries", "pcos"), opt("Menopause symptoms", "menopause"));
    else o.push(opt("Low libido or testosterone worries", "testosterone"));
    return q("hormone_concern", "What's the main concern?", "chips", o);
  }
  const c = s.answers.hormone_concern;
  if (c === "periods" && !asked(s, "period_redflags"))
    return q("period_redflags", "Are any of these happening?", "multi", [opt("Soaking a pad or tampon every hour", "heavy"), opt("Feeling dizzy or faint", "faint"), opt("Severe lower stomach pain", "pain"), opt("Bleeding after menopause or between periods", "abnormal"), NONE]);
  if (femaleOfChildbearingAge(f) && ["periods", "weight", "pcos", "energy"].includes(c ?? "") && !asked(s, "pregnancy_possible")) return q("pregnancy_possible", "Could you be pregnant?", "yesno", [opt("Yes", "yes"), opt("No", "no"), opt("Not sure", "unsure")]);
  if (!asked(s, "hormone_signs"))
    return q("hormone_signs", "Which of these have you noticed?", "multi", [opt("Weight gain or loss", "weight"), opt("Always tired", "fatigue"), opt("Feeling too hot or too cold", "temperature"), opt("Hair or skin changes", "hair_skin"), opt("Mood or sleep changes", "mood"), opt("Constipation or loose motions", "bowel"), NONE]);
  if (!s.onset) return q("onset", "How long has this been going on?", "duration", [opt("Less than a month", "under_month"), opt("1–6 months", "1_6_months"), opt("More than 6 months", "over_6_months")]);
  return null;
}

// ------------------------------------------------------------------------------------------------- falls (older adults especially)

export function fallNext(s: GuidedState, f: ModuleFacts): QuestionDef | null {
  const them = f.isSelf ? "you" : f.name;
  if (!asked(s, "fall_redflags"))
    return q("fall_redflags", "First, has any of this happened since the fall?", "multi", [
      opt("Knocked out, even briefly", "knocked_out"),
      opt("Confused, very drowsy or slurred speech", "confused"),
      opt("Hit the head and has vomited", "head_vomit"),
      opt("Bleeding that won't stop", "bleeding"),
      opt("Can't get up, or can't put weight on a leg", "cant_stand"),
      opt("Neck or back pain with numbness or weakness", "neck"),
      opt("Lay on the floor for an hour or more", "long_lie"),
      NONE,
    ]);
  if (!asked(s, "fall_head")) return q("fall_head", f.isSelf ? "Did you hit your head?" : `Did ${them} hit their head?`, "yesno", [opt("Yes", "yes"), opt("No", "no"), opt("Not sure", "unsure")]);
  if (s.answers.fall_head !== "no" && !asked(s, "fall_thinners"))
    return q("fall_thinners", `Do${f.isSelf ? " you" : `es ${them}`} take a blood thinner, like warfarin, apixaban, rivaroxaban, clopidogrel or aspirin?`, "yesno", [opt("Yes", "yes"), opt("No", "no"), opt("Not sure", "unsure")]);
  if (!asked(s, "fall_why"))
    return q("fall_why", "What happened just before the fall?", "chips", [opt("Tripped or slipped", "trip"), opt("Felt dizzy or faint first", "dizzy"), opt("Legs suddenly gave way", "legs"), opt("Doesn't remember", "unknown")]);
  if (!s.severity) return q("severity", "How much does it hurt now?", "scale", [opt("Mild", "mild", { hint: "1–3" }), opt("Moderate", "moderate", { hint: "4–6" }), opt("Severe", "severe", { hint: "7–10" })]);
  if (!asked(s, "fall_before")) return q("fall_before", "Has this happened before?", "chips", [opt("First fall", "first"), opt("Fallen before in the last year", "repeat")]);
  return null;
}

// ------------------------------------------------------------------------------------------------- fever: infections & exposure

const fluExposure = (s: GuidedState, v: string) => has(s, "fever_exposure", v);

/** Common, location-aware explanations for a fever (dengue, malaria and typhoid are common in India). */
function feverPossibilities(s: GuidedState): string[] {
  const p: string[] = [];
  if (fluExposure(s, "mosquito")) p.push("dengue or malaria, which a blood test can check — both are common in mosquito season");
  if (fluExposure(s, "water")) p.push("typhoid or another gut infection from food or water");
  if (fluExposure(s, "tb")) p.push("tuberculosis, especially with a cough for more than 2 weeks, weight loss or night sweats");
  if (has(s, "fever_associated", "respiratory")) p.push("a viral infection such as flu, COVID-19 or a cold");
  if (has(s, "fever_associated", "urine")) p.push("a urine infection");
  if (has(s, "fever_associated", "gi")) p.push("a stomach infection (gastroenteritis)");
  if (!p.length) p.push("a viral infection, the most common cause of fever");
  return p;
}

// ------------------------------------------------------------------------------------------------- mood, anxiety & stress

const signCount = (s: GuidedState) => (s.answers.mood_signs ?? "").split("|").filter((x) => x && x !== "none").length;
const lasting = (s: GuidedState) => ["two_weeks", "month_plus", "long"].includes(s.answers.mood_duration ?? "");

/** Gentle, one question at a time, with a direct but kind safety question early on. */
export function moodNext(s: GuidedState, f: ModuleFacts): QuestionDef | null {
  if (!asked(s, "mood_concern"))
    return q("mood_concern", f.isSelf ? "I'm sorry you've been feeling this way. What's been going on?" : `I'm sorry ${f.name} is going through this. What's been going on?`, "chips", [
      opt("Feeling low or sad", "low"),
      opt("Anxious, worried or panicky", "anxiety"),
      opt("Stressed or burnt out", "stress"),
      opt("Grief or a big loss", "grief"),
      opt("Something else", "other"),
    ]);
  if (!asked(s, "mood_duration"))
    return q("mood_duration", f.isSelf ? "Has this been happening for a few days, or longer?" : `How long has ${f.name} been feeling this way?`, "chips", [opt("A few days", "days"), opt("About two weeks", "two_weeks"), opt("A month or more", "month_plus"), opt("On and off for a long time", "long")]);
  if (!asked(s, "mood_safety"))
    return q(
      "mood_safety",
      f.isSelf ? "Sometimes when people feel this way, they have thoughts of not wanting to be alive. Have you had thoughts like that?" : `Has ${f.name} talked about not wanting to be alive, or about harming themselves?`,
      "chips",
      [opt("No", "no"), opt(f.isSelf ? "Sometimes, but I'm safe right now" : "They've mentioned it, but they're safe right now", "passive"), opt(f.isSelf ? "Yes, and I might act on them" : "Yes, and I'm worried they might act on it", "active"), opt("I'd rather not say", "skip")],
    );
  if (!asked(s, "mood_signs"))
    return s.answers.mood_concern === "anxiety"
      ? q("mood_signs", "Which of these happen?", "multi", [opt("Sudden waves of fear or panic", "panic"), opt("Racing heart", "racing"), opt("Breathless or chest tightness", "chest"), opt("Constant worrying that's hard to stop", "worry"), opt("Trouble sleeping", "sleep"), opt("Avoiding places or people", "avoid"), NONE])
      : q("mood_signs", f.isSelf ? "Have you also noticed changes in any of these?" : `Has ${f.name} also had changes in any of these?`, "multi", [opt("Sleep", "sleep"), opt("Appetite or weight", "appetite"), opt("Energy", "energy"), opt("Interest in things usually enjoyed", "interest"), opt("Concentration", "concentration"), opt("Feeling worthless or guilty", "worthless"), NONE]);
  if (!asked(s, "mood_impact")) return q("mood_impact", "How is it affecting day-to-day life?", "chips", [opt("Managing day to day", "managing"), opt("Hard to keep up with work, study or home", "struggling"), opt("Can't manage most days", "not_managing")]);
  return null;
}

/** Cautious explanations — never a diagnosis. */
export function modulePossibilities(s: GuidedState, f?: ModuleFacts): string[] | null {
  const more = moreModule(s.complaint);
  if (more && f) return more.possibilities(s, f);
  if (s.complaint === "fever") return feverPossibilities(s);
  if (s.complaint !== "mood") return null;
  const c = s.answers.mood_concern;
  if (c === "anxiety")
    return [
      ...(has(s, "mood_signs", "panic") ? ["panic attacks — sudden surges of fear with strong physical feelings, which are frightening but not dangerous in themselves"] : []),
      ...(has(s, "mood_signs", "worry") || lasting(s) ? ["an anxiety disorder, where worry becomes hard to switch off"] : ["anxiety in response to stress"]),
      "an overactive thyroid, or a lot of caffeine, which can cause similar feelings",
    ];
  if (c === "stress") return ["stress or burnout, especially with long-term pressure at work, study or home", ...(signCount(s) >= 2 && lasting(s) ? ["low mood or depression, which can develop alongside long-term stress"] : [])];
  if (c === "grief") return ["grief, a natural response to loss that can affect sleep, appetite and concentration for a long time", ...(lasting(s) && signCount(s) >= 3 ? ["depression, which sometimes follows a loss and is treatable"] : [])];
  return lasting(s) && signCount(s) >= 2
    ? ["depression — low mood with changes in sleep, energy or interest lasting two weeks or more — which is common and treatable", "physical causes such as an underactive thyroid, anaemia, low vitamin D or B12, or some medicines, which a doctor can check"]
    : ["a low patch after stress, poor sleep or a difficult event", "physical causes such as an underactive thyroid or anaemia, if it carries on"];
}

// ------------------------------------------------------------------------------------------------- red flags

export function moduleScreen(s: GuidedState, f: ModuleFacts, e: string[], u: string[]) {
  moreModule(s.complaint)?.screen(s, f, e, u);
  // Heart
  if (has(s, "palp_redflags", "faint")) e.push("Racing or irregular heartbeat with fainting");
  if (has(s, "palp_redflags", "chest_pain")) e.push("Palpitations with chest pain");
  if (has(s, "palp_redflags", "breathless")) e.push("Palpitations with breathlessness");
  if (has(s, "palp_redflags", "sustained")) u.push("A racing heartbeat lasting more than 15 minutes");
  if (has(s, "breathless_signs", "rest")) e.push("Breathless even at rest");
  if (has(s, "breathless_signs", "angina")) u.push("Chest pain or pressure that comes on with effort");
  if (has(s, "breathless_signs", "orthopnoea") && has(s, "breathless_signs", "oedema")) u.push("Breathlessness lying flat with swollen ankles");
  // Eyes
  if (has(s, "eye_redflags", "chemical")) e.push("Chemical in the eye — rinse with clean running water for at least 15 minutes while you get help");
  if (has(s, "eye_redflags", "injury")) e.push("An eye injury");
  if (has(s, "eye_redflags", "vision_loss")) e.push("Sudden loss or blurring of vision");
  if (has(s, "eye_redflags", "detachment")) u.push("Flashes, new floaters or a curtain over vision");
  if (has(s, "eye_redflags", "severe_pain")) e.push("Severe eye pain with headache or vomiting");
  if (has(s, "eye_symptoms", "lenses") && (has(s, "eye_symptoms", "photophobia") || has(s, "eye_symptoms", "red"))) u.push("A painful or red eye in a contact-lens wearer");
  if (has(s, "eye_symptoms", "photophobia") && has(s, "eye_symptoms", "blurred")) u.push("Eye pain with blurred vision");
  // Falls
  if (has(s, "fall_redflags", "knocked_out")) e.push("Knocked out after a fall");
  if (has(s, "fall_redflags", "confused")) e.push("Confusion, drowsiness or slurred speech after a fall");
  if (has(s, "fall_redflags", "head_vomit")) e.push("Vomiting after a head injury");
  if (has(s, "fall_redflags", "bleeding")) e.push("Bleeding that won't stop");
  if (has(s, "fall_redflags", "neck")) e.push("Neck or back pain with numbness or weakness — try not to move the neck");
  if (has(s, "fall_redflags", "cant_stand")) u.push("Can't get up or put weight on a leg — this can be a broken hip");
  if (has(s, "fall_redflags", "long_lie")) u.push("Lying on the floor for a long time after a fall");
  if (s.answers.fall_head && s.answers.fall_head !== "no" && s.answers.fall_thinners && s.answers.fall_thinners !== "no") u.push("A head injury while taking a blood thinner");
  if (s.answers.fall_head === "yes" && f.age != null && f.age >= 65) u.push("A head injury at 65 or older");
  if (s.complaint === "fall" && s.severity === "severe") u.push("Severe pain after a fall");
  // Hormones & periods
  if (has(s, "period_redflags", "heavy") && has(s, "period_redflags", "faint")) e.push("Very heavy bleeding with dizziness or fainting");
  else if (has(s, "period_redflags", "heavy")) u.push("Very heavy bleeding");
  if (has(s, "period_redflags", "pain") && s.answers.pregnancy_possible !== "no" && femaleOfChildbearingAge(f)) u.push("Severe lower stomach pain when you could be pregnant");
  if (has(s, "period_redflags", "abnormal")) u.push("Bleeding after menopause or between periods");
}

// ------------------------------------------------------------------------------------------------- outcome helpers

export function moduleSpecialist(s: GuidedState, f: ModuleFacts): { speciality: string; reason: string } | null {
  const more = moreModule(s.complaint);
  if (more) return more.specialist(s, f);
  if (s.complaint === "fever" && fluExposure(s, "mosquito")) return { speciality: "General Physician", reason: "A General Physician can examine you and arrange blood tests such as dengue and malaria tests." };
  switch (s.complaint) {
    case "heart":
      if (s.answers.heart_symptom === "risk") return { speciality: "General Physician", reason: "A General Physician can check blood pressure, sugar and cholesterol and work out overall heart risk." };
      if (knownHeart(f) || s.answers.palp_pattern === "daily" || s.answers.heart_symptom === "breathless") return { speciality: "Cardiologist", reason: "A Cardiologist commonly evaluates palpitations and breathlessness linked to the heart, often with an ECG." };
      return { speciality: "General Physician", reason: "A General Physician can start with an ECG and simple blood tests, and refer to a Cardiologist if needed." };
    case "eye":
      return { speciality: "Ophthalmologist", reason: "An Ophthalmologist (eye doctor) can examine the eye properly — photos can't rule things out." };
    case "mood":
      if (s.answers.mood_safety === "passive" || s.answers.mood_impact === "not_managing") return { speciality: "Psychiatrist", reason: "A Psychiatrist can assess how you're feeling and talk through support, talking therapy and, if needed, medicine." };
      return { speciality: "Clinical Psychologist", reason: "A Clinical Psychologist offers talking therapies such as CBT, which help with low mood, anxiety and stress." };
    case "fall":
      return { speciality: "General Physician", reason: "A General Physician can look for the cause — medicines, blood pressure, heart rhythm, eyesight or balance — and help prevent another fall." };
    case "hair":
      if (has(s, "hair_context", "thyroid") || has(s, "hair_context", "periods")) return { speciality: "General Physician", reason: "A General Physician can check for common causes like thyroid or iron levels with a simple blood test." };
      return { speciality: "Dermatologist", reason: "A Dermatologist specialises in hair and scalp problems." };
    case "hormones": {
      const c = s.answers.hormone_concern;
      if (c === "periods" || c === "pcos" || c === "menopause") return { speciality: "Gynaecologist", reason: "A Gynaecologist commonly evaluates period changes, PCOS symptoms and menopause." };
      if (c === "thyroid" && f.conditions.some((x) => /thyroid/i.test(x))) return { speciality: "Endocrinologist", reason: "An Endocrinologist manages thyroid conditions." };
      return { speciality: "General Physician", reason: "A General Physician can arrange the right blood tests before deciding if a specialist is needed." };
    }
  }
  return null;
}

/** Whether the module wants a professional review even without red flags. */
export function moduleNeedsReview(s: GuidedState, f: ModuleFacts): string | null {
  const more = moreModule(s.complaint);
  if (more) return more.needsReview(s, f);
  switch (s.complaint) {
    case "heart":
      if (s.answers.heart_symptom === "risk") return (s.answers.heart_risks ?? "none") !== "none" ? "some heart risk factors are worth checking regularly" : null;
      if (s.answers.heart_symptom === "breathless") return "new breathlessness or swelling should be checked";
      if (s.answers.palp_pattern !== "once" || knownHeart(f)) return "palpitations that keep coming back are worth an ECG";
      return null;
    case "eye":
      if (has(s, "eye_symptoms", "photophobia") || has(s, "eye_symptoms", "blurred") || has(s, "eye_symptoms", "foreign_body")) return "eye pain, light sensitivity or blurred vision need an eye examination";
      if (s.onset === "4_7_days" || s.onset === "over_week") return "it hasn't settled within a few days";
      return null;
    case "hair":
      if (s.answers.hair_pattern === "patchy" || s.answers.hair_pattern === "scalp") return "patchy hair loss or scalp changes are best looked at by a doctor";
      if (has(s, "hair_context", "thyroid") || has(s, "hair_context", "periods") || has(s, "hair_context", "diet")) return "a simple blood test can check for common causes";
      if (s.onset === "over_6_months") return "it has gone on for more than six months";
      return null;
    case "hormones":
      return "hormone-related symptoms usually need a blood test to understand";
    case "fever":
      if (fluExposure(s, "mosquito") && ["3_4_days", "5_plus_days"].includes(s.onset ?? "")) return "a fever for 3 days or more where dengue or malaria are common needs a blood test";
      if (fluExposure(s, "tb")) return "contact with tuberculosis should be checked";
      if (fluExposure(s, "water") && ["3_4_days", "5_plus_days"].includes(s.onset ?? "")) return "a lasting fever after untreated water or street food can be typhoid";
      return null;
    case "mood":
      if (s.answers.mood_safety === "passive") return "you mentioned thoughts of not wanting to be alive";
      if (s.answers.mood_impact === "not_managing") return "it's making day-to-day life very hard";
      if (s.answers.mood_impact === "struggling") return "it's affecting work, study or home life";
      if (has(s, "mood_signs", "panic")) return "panic attacks respond well to treatment";
      if (lasting(s) && signCount(s) >= 2) return "these feelings have lasted two weeks or more, with other changes";
      return null;
    case "fall":
      if (s.answers.fall_why && s.answers.fall_why !== "trip") return "a fall without a clear trip needs checking for the cause";
      if (s.answers.fall_before === "repeat") return "repeated falls are worth a medicines and balance review";
      if (f.age != null && f.age >= 65) return "falls at 65 or older are worth a check, even when the injury is small";
      return null;
  }
  return null;
}

export function moduleSelfCare(s: GuidedState): string[] | null {
  const more = moreModule(s.complaint);
  if (more) return more.selfCare(s);
  switch (s.complaint) {
    case "heart":
      if (s.answers.heart_symptom === "risk") return ["Know your numbers: blood pressure, sugar and cholesterol", "Aim for 30 minutes of brisk walking most days", "If you smoke, stopping is the single biggest step", "Eat more vegetables, fruit and whole grains; less salt and fried food"];
      return ["Cut down on tea, coffee and energy drinks for a while", "Note when it happens, how long it lasts and what you were doing", "Rest, and try slow breathing when it starts", "Don't start or stop heart medicines on your own"];
    case "eye":
      return ["Don't rub the eye", "Take out contact lenses and don't wear them until it's better", "A cool, clean compress can soothe itching or swelling", "Don't use old or someone else's eye drops"];
    case "hair":
      return ["Be gentle: avoid tight hairstyles and too much heat styling", "Eat regular meals with enough protein", "Shedding after illness, stress or childbirth often settles within 6–12 months", "Don't start supplements for hair loss without a test showing you need them"];
    case "mood": {
      const base = ["Talk to someone you trust about how you're feeling — you don't have to handle this alone", "Keep a simple routine: regular sleep, meals and a short walk outside each day", "Cut down on alcohol and caffeine, which can make low mood and anxiety worse"];
      if (s.answers.mood_concern === "anxiety") return ["When panic starts, breathe slowly: in for 4, hold for 4, out for 6, and remind yourself it will pass", ...base.slice(1)];
      if (s.answers.mood_concern === "grief") return ["Allow yourself to grieve; there's no right way or timetable", ...base];
      return base;
    }
    case "fall":
      return ["Rest, and use a cold pack wrapped in cloth for 15 minutes on sore areas", "After a bump to the head, someone should stay with them for the next 24 hours", "Remove trip hazards like loose rugs and cables, and use a night light", "Ask the doctor to review medicines that can cause dizziness or sleepiness"];
    case "hormones":
      return ["Keep a simple diary of periods, symptoms, weight and sleep", "Regular meals, activity and sleep help many hormone-related symptoms", "Ask your doctor which blood tests make sense — don't guess with supplements"];
  }
  return null;
}

export function moduleWatchFor(s: GuidedState): string[] | null {
  const more = moreModule(s.complaint);
  if (more) return more.watchFor(s);
  switch (s.complaint) {
    case "heart":
      return ["Chest pain, pressure or tightness", "Fainting or nearly fainting", "Breathlessness at rest", "A fast heartbeat that doesn't settle"];
    case "eye":
      return ["Sudden loss or blurring of vision", "Severe pain, or light becomes very painful", "Flashes, new floaters or a curtain over vision", "Any chemical or injury to the eye"];
    case "hair":
      return ["Hair loss with weight loss, fevers or feeling very unwell", "Painful, red or scarring patches on the scalp"];
    case "mood":
      return ["Thoughts of harming yourself or not wanting to be alive — call a crisis line or emergency services", "Not eating, drinking or getting out of bed for days", "Hearing or seeing things others don't", "New chest pain or breathlessness — don't assume it's anxiety"];
    case "fall":
      return ["A headache that gets worse, vomiting or new confusion", "Unusual sleepiness or trouble waking", "Can't stand or walk, or new pain in the hip", "Weakness, numbness or slurred speech"];
    case "hormones":
      return ["Very heavy bleeding, or feeling faint", "Severe stomach pain, especially if you could be pregnant", "Rapid unexplained weight loss", "Racing heart with sweating and shaking"];
  }
  return null;
}

export function modulePhrase(s: GuidedState): string | null {
  const more = moreModule(s.complaint);
  if (more) return more.phrase(s);
  switch (s.complaint) {
    case "heart":
      return ({ palpitations: "palpitations", breathless: "breathlessness on effort", risk: "heart risk check", chest: "chest pain" } as Record<string, string>)[s.answers.heart_symptom ?? ""] ?? "heart concern";
    case "eye":
      return s.answers.eye_which === "both" ? "eye problem (both eyes)" : "eye problem";
    case "hair":
      return "hair loss";
    case "fall":
      return "fall";
    case "mood":
      return ({ low: "low mood", anxiety: "anxiety", stress: "stress", grief: "grief" } as Record<string, string>)[s.answers.mood_concern ?? ""] ?? "emotional wellbeing";
    case "hormones":
      return ({ periods: "period changes", pcos: "PCOS worries", menopause: "menopause symptoms", thyroid: "thyroid symptoms", weight: "weight change", energy: "low energy or mood", testosterone: "testosterone worries" } as Record<string, string>)[s.answers.hormone_concern ?? ""] ?? "hormone concern";
  }
  return null;
}
