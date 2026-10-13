/**
 * More symptom checks: ear, nose and throat; teeth and mouth; urinary; sleep; pregnancy and after birth.
 * Each module supplies its questions, red flags, cautious possibilities, self-care and who to see, in the same
 * shape as the other modules. Demo content — requires clinical review before production use.
 */
import type { Complaint, GuidedState, QuestionDef } from "./types";
import type { ModuleFacts } from "./modules";

type Opt = { label: string; value: string; exclusive?: boolean };
const opt = (label: string, value: string): Opt => ({ label, value });
const NONE: Opt = { label: "None of these", value: "none", exclusive: true };
const q = (key: string, text: string, style: QuestionDef["style"], options: Opt[]): QuestionDef => ({ key, text, style, options });
const yesNo = [opt("Yes", "yes"), opt("No", "no"), opt("Not sure", "unsure")];
const has = (s: GuidedState, key: string, v: string) => (s.answers[key] ?? "").split("|").includes(v);
const asked = (s: GuidedState, k: string) => s.answers[k] != null;
const longDuration = (s: GuidedState) => ["over_3_weeks", "over_3_months"].includes(s.onset ?? "");
const female = (f: ModuleFacts) => f.sex === "female";
const durationQ = (text = "How long has this been going on?") => q("onset", text, "duration", [opt("Started today", "today"), opt("A few days", "1_3_days"), opt("1–3 weeks", "1_3_weeks"), opt("More than 3 weeks", "over_3_weeks")]);

export interface MoreModule {
  next: (s: GuidedState, f: ModuleFacts) => QuestionDef | null;
  screen: (s: GuidedState, f: ModuleFacts, e: string[], u: string[]) => void;
  possibilities: (s: GuidedState, f: ModuleFacts) => string[];
  specialist: (s: GuidedState, f: ModuleFacts) => { speciality: string; reason: string };
  needsReview: (s: GuidedState, f: ModuleFacts) => string | null;
  selfCare: (s: GuidedState) => string[];
  watchFor: (s: GuidedState) => string[];
  phrase: (s: GuidedState) => string;
  multiKeys: string[];
}

// ----------------------------------------------------------------------------------------------- ear, nose & throat

const ent: MoreModule = {
  multiKeys: ["ent_redflags", "ear_signs", "nose_signs", "throat_signs"],
  next: (s) => {
    if (!asked(s, "ent_part")) return q("ent_part", "Is it your ear, nose or throat?", "chips", [opt("Ear", "ear"), opt("Nose or sinuses", "nose"), opt("Throat or voice", "throat")]);
    const part = s.answers.ent_part;
    if (!asked(s, "ent_redflags")) {
      const options =
        part === "ear"
          ? [opt("Sudden loss of hearing in one ear", "sudden_hearing"), opt("Swelling, redness or pain behind the ear", "mastoid"), opt("Severe dizziness, or the face drooping on one side", "neuro"), opt("Something stuck in the ear", "object"), NONE]
          : part === "nose"
            ? [opt("Nosebleed for more than 15 minutes despite pinching", "bleed"), opt("Swelling or redness around the eye", "orbital"), opt("Severe headache with fever or a stiff neck", "mening"), opt("Nosebleed after a head injury", "head_injury"), NONE]
            : [opt("Can't swallow saliva, or drooling", "drool"), opt("Noisy breathing or struggling to breathe", "stridor"), opt("Can't open the mouth fully, or severe pain on one side", "quinsy"), opt("Swelling in the neck", "neck_swell"), NONE];
      return q("ent_redflags", "Do any of these apply?", "multi", options);
    }
    if (!s.onset) return durationQ();
    if (part === "ear" && !asked(s, "ear_signs"))
      return q("ear_signs", "What are you noticing?", "multi", [opt("Pain", "pain"), opt("Discharge from the ear", "discharge"), opt("Blocked or muffled hearing", "blocked"), opt("Ringing or buzzing", "tinnitus"), opt("Itchy, or hurts when the ear is pulled", "outer"), opt("Had a cold recently", "cold")]);
    if (part === "nose" && !asked(s, "nose_signs"))
      return q("nose_signs", "What are you noticing?", "multi", [opt("Blocked or runny nose", "blocked"), opt("Sneezing and itchy eyes", "allergy"), opt("Pain or pressure in the face", "face_pain"), opt("Thick yellow or green mucus", "mucus"), opt("Lost sense of smell", "smell"), opt("Nosebleeds", "bleeds")]);
    if (part === "throat" && !asked(s, "throat_signs"))
      return q("throat_signs", "Do any of these go with it?", "multi", [opt("Fever", "fever"), opt("White patches on the tonsils", "patches"), opt("Swollen glands in the neck", "glands"), opt("Cough or runny nose", "cough"), opt("Hoarse voice", "hoarse"), opt("A lump in the neck", "lump"), NONE]);
    return null;
  },
  screen: (s, _f, e, u) => {
    for (const [v, label] of [
      ["neuro", "Severe dizziness or a drooping face — a stroke needs ruling out"],
      ["bleed", "A nosebleed that won't stop"],
      ["orbital", "Swelling or redness around the eye with a nose or sinus problem"],
      ["mening", "Severe headache with fever or a stiff neck"],
      ["drool", "Can't swallow saliva"],
      ["stridor", "Noisy breathing or struggling to breathe"],
    ] as const)
      if (has(s, "ent_redflags", v)) e.push(label);
    for (const [v, label] of [
      ["sudden_hearing", "Sudden hearing loss in one ear — this needs assessment within a day"],
      ["mastoid", "Swelling or pain behind the ear"],
      ["object", "Something stuck in the ear"],
      ["head_injury", "A nosebleed after a head injury"],
      ["quinsy", "Severe one-sided throat pain or can't open the mouth — an abscess near the tonsil needs ruling out"],
      ["neck_swell", "Swelling in the neck with a sore throat"],
    ] as const)
      if (has(s, "ent_redflags", v)) u.push(label);
  },
  possibilities: (s) => {
    const part = s.answers.ent_part;
    if (part === "ear") {
      const p: string[] = [];
      if (has(s, "ear_signs", "outer")) p.push("an infection of the outer ear canal (otitis externa)");
      if (has(s, "ear_signs", "pain") && (has(s, "ear_signs", "cold") || has(s, "ear_signs", "discharge"))) p.push("a middle ear infection (otitis media), which often follows a cold");
      if (has(s, "ear_signs", "blocked")) p.push("earwax build-up", "fluid behind the eardrum after a cold");
      if (has(s, "ear_signs", "tinnitus")) p.push("tinnitus, often linked to noise exposure or hearing changes");
      return p.length ? p : ["an ear infection", "pain referred from the jaw or teeth"];
    }
    if (part === "nose") {
      const p: string[] = [];
      if (has(s, "nose_signs", "allergy")) p.push("an allergy such as hay fever or dust allergy (allergic rhinitis)");
      if (has(s, "nose_signs", "face_pain") || has(s, "nose_signs", "mucus")) p.push("sinusitis, which usually follows a cold and often clears within 2–3 weeks");
      if (!p.length) p.push("a common cold");
      return p;
    }
    if (has(s, "throat_signs", "hoarse") && longDuration(s)) return ["a voice problem that needs a look at the voice box, because it has lasted more than 3 weeks"];
    if (has(s, "throat_signs", "patches") && has(s, "throat_signs", "fever") && !has(s, "throat_signs", "cough")) return ["tonsillitis, which can be viral or bacterial (strep throat)", "glandular fever, especially in teenagers and young adults"];
    return ["a viral sore throat, the most common cause, which usually clears within a week", ...(has(s, "throat_signs", "hoarse") ? ["laryngitis or voice strain"] : [])];
  },
  specialist: (s) =>
    has(s, "ent_redflags", "sudden_hearing") || has(s, "throat_signs", "lump") || (has(s, "throat_signs", "hoarse") && longDuration(s)) || has(s, "ear_signs", "tinnitus")
      ? { speciality: "ENT Specialist", reason: "An ENT specialist commonly evaluates hearing changes, a lasting hoarse voice or a neck lump." }
      : { speciality: "General Physician", reason: "A General Physician can examine the ear, nose or throat and decide if anything else is needed." },
  needsReview: (s) => {
    if (has(s, "throat_signs", "lump") || (has(s, "throat_signs", "hoarse") && longDuration(s))) return "a hoarse voice or neck lump lasting 3 weeks or more should be checked";
    if (has(s, "throat_signs", "patches") && has(s, "throat_signs", "fever")) return "these signs may need an examination, and sometimes antibiotics";
    if (has(s, "ear_signs", "discharge")) return "ear discharge should be looked at";
    if (has(s, "ear_signs", "tinnitus") || has(s, "ear_signs", "blocked")) return s.onset === "over_3_weeks" ? "hearing changes that last should be checked" : null;
    if (s.answers.ent_part === "nose" && longDuration(s)) return "sinus symptoms lasting more than 3 weeks are worth checking";
    if (has(s, "nose_signs", "bleeds")) return "repeated nosebleeds are worth checking";
    return null;
  },
  selfCare: (s) => {
    const part = s.answers.ent_part;
    if (part === "ear") return ["Don't put cotton buds or anything else in the ear", "Keep the ear dry while it's sore", "A warm compress over the ear can ease pain", "Use a pain reliever that usually suits you, following the label"];
    if (part === "nose") return ["Steam inhalation or saline nose rinses can ease a blocked nose", "Drink plenty of fluids and rest", "For a nosebleed: sit forward and pinch the soft part of the nose firmly for 10–15 minutes", ...(has(s, "nose_signs", "allergy") ? ["Keep windows closed on high-pollen days, and wash your face and hair after being outside"] : [])];
    return ["Warm drinks, honey in warm water (not for babies under 1) and salt-water gargles can soothe", "Drink plenty of fluids and rest your voice", "Use a pain reliever that usually suits you, following the label"];
  },
  watchFor: () => ["Difficulty breathing, or can't swallow saliva", "Severe pain on one side of the throat, or can't open the mouth", "Swelling behind the ear, around the eye or in the neck", "Sudden hearing loss"],
  phrase: (s) => (s.answers.ent_part === "ear" ? "ear problem" : s.answers.ent_part === "nose" ? "nose or sinus problem" : "sore throat"),
};

// ----------------------------------------------------------------------------------------------- teeth & mouth

const dental: MoreModule = {
  multiKeys: ["dental_redflags", "tooth_signs", "gum_signs", "jaw_signs"],
  next: (s) => {
    if (!asked(s, "dental_issue")) return q("dental_issue", "What's the problem?", "chips", [opt("Toothache", "toothache"), opt("Bleeding or sore gums", "gums"), opt("Mouth ulcer or sore patch", "ulcer"), opt("Jaw pain", "jaw"), opt("Swelling in the face or gum", "swelling")]);
    if (!asked(s, "dental_redflags"))
      return q("dental_redflags", "Do any of these apply?", "multi", [opt("Swelling spreading to the eye or neck", "spread"), opt("Trouble swallowing or breathing", "airway"), opt("Fever with a swollen face", "fever"), opt("Jaw pain with chest pain, sweating or breathlessness", "cardiac"), opt("A tooth knocked out or broken in an injury", "trauma"), NONE]);
    if (!s.onset) return durationQ();
    const issue = s.answers.dental_issue;
    if ((issue === "toothache" || issue === "swelling") && !asked(s, "tooth_signs"))
      return q("tooth_signs", "What does it feel like?", "multi", [opt("Sharp twinge with hot or cold", "sensitivity"), opt("Throbbing, or keeps me awake", "throbbing"), opt("Hurts when I bite", "bite"), opt("Swollen gum or a bad taste", "abscess")]);
    if (issue === "gums" && !asked(s, "gum_signs")) return q("gum_signs", "Which of these apply?", "multi", [opt("Bleeding when brushing", "bleeding"), opt("Swollen or red gums", "swollen"), opt("Loose teeth", "loose"), opt("Bad breath that doesn't go away", "breath")]);
    if (issue === "ulcer" && !asked(s, "ulcer_kind")) return q("ulcer_kind", "What is it like?", "chips", [opt("One ulcer", "single"), opt("Several, they come and go", "recurrent"), opt("A white or red patch that won't heal", "patch")]);
    if (issue === "jaw" && !asked(s, "jaw_signs")) return q("jaw_signs", "Which of these apply?", "multi", [opt("Clicking or locking", "clicking"), opt("Worse when chewing or in the morning", "chewing"), opt("I grind or clench my teeth", "grinding"), NONE]);
    return null;
  },
  screen: (s, _f, e, u) => {
    if (has(s, "dental_redflags", "spread")) e.push("Facial swelling spreading to the eye or neck");
    if (has(s, "dental_redflags", "airway")) e.push("Trouble swallowing or breathing with a mouth problem");
    if (has(s, "dental_redflags", "cardiac")) e.push("Jaw pain with chest pain, sweating or breathlessness — this can be the heart");
    if (has(s, "dental_redflags", "fever")) u.push("Fever with a swollen face — a dental infection needs treatment today");
    if (has(s, "dental_redflags", "trauma")) u.push("A knocked-out or broken tooth — if an adult tooth is knocked out, hold it by the top, rinse it, put it back or keep it in milk, and see a dentist within the hour");
  },
  possibilities: (s) => {
    const issue = s.answers.dental_issue;
    if (issue === "gums") return has(s, "gum_signs", "loose") ? ["gum disease (periodontitis), which can loosen teeth"] : ["gum inflammation (gingivitis), usually from plaque, which improves with good cleaning"];
    if (issue === "ulcer") {
      if (s.answers.ulcer_kind === "patch" || longDuration(s)) return ["a mouth patch or ulcer that hasn't healed in 3 weeks needs checking to rule out anything serious"];
      return s.answers.ulcer_kind === "recurrent" ? ["recurring mouth ulcers, sometimes linked to stress, or low iron, vitamin B12 or folate"] : ["a common mouth ulcer, or one caused by a bite or sharp tooth"];
    }
    if (issue === "jaw") return ["strain of the jaw joint and chewing muscles (temporomandibular disorder), often with teeth grinding", "pain from a back tooth"];
    const p: string[] = [];
    if (has(s, "tooth_signs", "sensitivity")) p.push("sensitive teeth from worn enamel or receding gums", "a small cavity");
    if (has(s, "tooth_signs", "throbbing")) p.push("inflammation of the tooth's nerve (pulpitis), usually from deep decay");
    if (has(s, "tooth_signs", "abscess") || issue === "swelling") p.push("a dental abscess — an infection at the root of a tooth or in the gum");
    if (has(s, "tooth_signs", "bite")) p.push("a cracked tooth or a problem with a filling");
    return p.length ? p : ["tooth decay", "gum infection"];
  },
  specialist: (s) => (s.answers.dental_issue === "ulcer" && (s.answers.ulcer_kind === "patch" || longDuration(s)) ? { speciality: "Dentist", reason: "A dentist can examine a patch or ulcer that hasn't healed and arrange a biopsy if needed." } : { speciality: "Dentist", reason: "A dentist can find and treat the cause — most tooth and gum pain needs treatment rather than painkillers alone." }),
  needsReview: (s) => {
    const issue = s.answers.dental_issue;
    if (issue === "toothache" || issue === "swelling") return "tooth pain usually needs a dentist to treat the cause";
    if (issue === "gums" && (has(s, "gum_signs", "loose") || longDuration(s))) return "loose teeth or long-lasting gum problems need a dental check";
    if (issue === "ulcer" && (s.answers.ulcer_kind === "patch" || longDuration(s))) return "a mouth ulcer or patch lasting 3 weeks should be checked";
    if (issue === "jaw" && longDuration(s)) return "jaw pain that lasts is worth checking";
    return null;
  },
  selfCare: (s) => {
    const issue = s.answers.dental_issue;
    if (issue === "ulcer") return ["Use a soft toothbrush, and avoid spicy, salty or acidic food for now", "Warm salt-water rinses can help healing", "Most ulcers heal within 1–2 weeks"];
    if (issue === "gums") return ["Brush gently twice a day with fluoride toothpaste, and clean between your teeth daily", "Bleeding gums often settle within 2 weeks of good cleaning", "If you smoke, stopping helps your gums heal"];
    if (issue === "jaw") return ["Eat soft foods and avoid chewing gum for a while", "A warm compress on the jaw can ease muscle pain", "Try to keep your teeth apart and your jaw relaxed during the day"];
    return ["Rinse with warm salt water", "Use a pain reliever that usually suits you, following the label — don't put aspirin directly on the gum", "Avoid very hot, cold or sweet foods", "Keep brushing gently twice a day"];
  },
  watchFor: () => ["Swelling spreading to the eye or neck", "Trouble swallowing or breathing", "Fever with a swollen face", "A mouth ulcer or patch that hasn't healed in 3 weeks"],
  phrase: (s) => ({ toothache: "toothache", gums: "gum problem", ulcer: "mouth ulcer", jaw: "jaw pain", swelling: "facial or gum swelling" } as Record<string, string>)[s.answers.dental_issue ?? ""] ?? "mouth problem",
};

// ----------------------------------------------------------------------------------------------- urinary

const urinary: MoreModule = {
  multiKeys: ["urine_redflags", "urine_signs"],
  next: (s, f) => {
    if (!asked(s, "urine_issue"))
      return q("urine_issue", "What's happening?", "chips", [opt("Burning or pain when passing urine", "burning"), opt("Passing urine very often or urgently", "frequency"), opt("Blood in the urine", "blood"), opt("Can't pass urine, or only a little", "retention"), opt("Leaking urine", "leaking"), opt("Pain in the side or back that comes in waves", "colic")]);
    if (!asked(s, "urine_redflags")) {
      const o = [opt("Fever or shivering", "fever"), opt("Pain in the side or lower back", "loin"), opt("Vomiting", "vomiting"), opt("Can't pass any urine at all", "none_passed"), opt("Confused or very unwell", "confused")];
      if (female(f) && (f.age == null || (f.age >= 12 && f.age <= 55))) o.push(opt("Pregnant", "pregnant"));
      o.push(NONE);
      return q("urine_redflags", "Do any of these apply?", "multi", o);
    }
    if (!s.onset) return durationQ();
    const issue = s.answers.urine_issue;
    if ((issue === "burning" || issue === "frequency") && !asked(s, "urine_signs"))
      return q("urine_signs", "Do any of these apply?", "multi", [opt("Cloudy or smelly urine", "cloudy"), opt("Pain low in the tummy", "suprapubic"), opt("Unusual discharge", "discharge"), opt("A new sexual partner", "new_partner"), opt("Very thirsty all the time", "thirst"), NONE]);
    if (issue === "leaking" && !asked(s, "leak_kind"))
      return q("leak_kind", "When does it happen?", "chips", [opt("When coughing, sneezing, laughing or lifting", "stress"), opt("A sudden urge, and I can't make it in time", "urge"), opt("Dribbling, with a weak stream", "overflow")]);
    if (issue === "blood" && !asked(s, "blood_pain")) return q("blood_pain", "Is it painful to pass urine?", "yesno", yesNo);
    return null;
  },
  screen: (s, f, e, u) => {
    if (has(s, "urine_redflags", "none_passed") || s.answers.urine_issue === "retention") u.push("Unable to pass urine — this needs same-day care");
    if (has(s, "urine_redflags", "fever") && (has(s, "urine_redflags", "loin") || has(s, "urine_redflags", "vomiting"))) u.push("Fever with side or back pain or vomiting — a kidney infection needs treatment today");
    if (has(s, "urine_redflags", "confused")) u.push(f.age != null && f.age >= 65 ? "New confusion in an older adult — infections can show up this way" : "Feeling confused or very unwell");
    if (s.answers.urine_issue === "colic" && has(s, "urine_redflags", "fever")) e.push("Kidney-stone type pain with fever — an infected, blocked kidney is an emergency");
    else if (s.answers.urine_issue === "colic") u.push("Pain in the side that comes in waves — a kidney stone needs assessment");
    if (has(s, "urine_redflags", "pregnant") && ["burning", "frequency", "blood"].includes(s.answers.urine_issue ?? "")) u.push("Urine symptoms in pregnancy need a check the same day");
  },
  possibilities: (s, f) => {
    const issue = s.answers.urine_issue;
    if (issue === "leaking") return s.answers.leak_kind === "stress" ? ["stress incontinence, often after childbirth or with age — pelvic floor exercises often help"] : s.answers.leak_kind === "urge" ? ["an overactive bladder", "a urine infection, if it's new"] : ["an enlarged prostate or a weak bladder muscle, where the bladder doesn't empty fully"];
    if (issue === "blood") return ["a urine infection, especially if it's painful", "a kidney or bladder stone", "less commonly a problem in the bladder or kidney, which is why painless blood always needs tests"];
    if (issue === "colic") return ["a kidney stone"];
    const p: string[] = [];
    if (has(s, "urine_signs", "thirst")) p.push("high blood sugar, which can cause thirst and passing urine often");
    if (has(s, "urine_signs", "discharge") || has(s, "urine_signs", "new_partner")) p.push("a sexually transmitted infection, which a simple test can check");
    p.push(f.sex === "male" ? "a urine infection or inflammation of the prostate" : "a bladder infection (UTI), which is common in women");
    if (f.sex === "male" && (f.age ?? 0) >= 50 && issue === "frequency") p.push("an enlarged prostate");
    return p;
  },
  specialist: (s) =>
    s.answers.urine_issue === "blood" || s.answers.urine_issue === "colic" || s.answers.leak_kind === "overflow"
      ? { speciality: "Urologist", reason: "A Urologist commonly evaluates blood in the urine, kidney stones and prostate problems." }
      : { speciality: "General Physician", reason: "A General Physician can test your urine and treat an infection if there is one." },
  needsReview: (s, f) => {
    const issue = s.answers.urine_issue;
    if (issue === "blood") return "blood in the urine should always be checked";
    if (issue === "leaking") return "there are effective treatments for leaking urine";
    if (has(s, "urine_signs", "thirst")) return "thirst and passing urine often should be checked with a sugar test";
    if (has(s, "urine_signs", "discharge") || has(s, "urine_signs", "new_partner")) return "a test can check for infection";
    if (f.sex === "male") return "urine symptoms in men should be checked";
    if ((f.age ?? 30) >= 65 || (f.age ?? 30) < 12 || f.conditions.some((c) => /diabet|kidney/i.test(c))) return "a lower threshold for checks applies here";
    if (s.onset !== "today" && s.onset !== "1_3_days") return "it hasn't settled within a few days";
    return null;
  },
  selfCare: (s) =>
    s.answers.urine_issue === "leaking"
      ? ["Pelvic floor exercises: squeeze as if stopping your urine for 10 seconds, 10 times, three times a day", "Cut down on caffeine and fizzy drinks", "Don't cut back on water — concentrated urine irritates the bladder"]
      : ["Drink plenty of water through the day", "Don't hold urine in — go when you need to", "Paracetamol can ease discomfort if it suits you, following the label", "See a doctor if it isn't better within 2 days"],
  watchFor: () => ["Fever or shivering", "Pain in the side or lower back", "Vomiting", "Blood in the urine", "Not able to pass urine"],
  phrase: (s) => ({ burning: "burning urine", frequency: "passing urine often", blood: "blood in the urine", retention: "difficulty passing urine", leaking: "leaking urine", colic: "side pain" } as Record<string, string>)[s.answers.urine_issue ?? ""] ?? "urine problem",
};

// ----------------------------------------------------------------------------------------------- sleep

const sleep: MoreModule = {
  multiKeys: ["sleep_redflags", "sleep_habits", "apnoea_signs", "rls_signs"],
  next: (s) => {
    if (!asked(s, "sleep_issue"))
      return q("sleep_issue", "What's the sleep problem?", "chips", [opt("Can't fall or stay asleep", "insomnia"), opt("Snoring, or stopping breathing at night", "apnoea"), opt("Very sleepy during the day", "sleepy"), opt("Restless, uncomfortable legs at night", "rls"), opt("Nightmares or sleepwalking", "parasomnia")]);
    if (!asked(s, "sleep_redflags"))
      return q("sleep_redflags", "Do any of these apply?", "multi", [opt("Fallen asleep while driving", "driving"), opt("Someone has seen you stop breathing in your sleep", "witnessed"), opt("Breathless lying flat, or chest pain at night", "cardiac"), opt("Low mood, or thoughts of not wanting to be alive", "mood"), NONE]);
    if (!s.onset) return q("onset", "How long has this been going on?", "duration", [opt("A few weeks", "few_weeks"), opt("1–3 months", "1_3_months"), opt("More than 3 months", "over_3_months")]);
    const issue = s.answers.sleep_issue;
    if (issue === "insomnia" && !asked(s, "sleep_habits"))
      return q("sleep_habits", "Do any of these apply?", "multi", [opt("Phone or screens in bed", "screens"), opt("Tea, coffee or cola after 4pm", "caffeine"), opt("Worry or racing thoughts", "worry"), opt("Shift work", "shifts"), opt("Pain keeps me awake", "pain"), opt("Getting up to pee at night", "nocturia"), NONE]);
    if ((issue === "apnoea" || issue === "sleepy") && !asked(s, "apnoea_signs"))
      return q("apnoea_signs", "Do any of these apply?", "multi", [opt("Loud snoring", "snoring"), opt("Morning headaches", "headache"), opt("Tired even after a full night", "unrefreshed"), opt("High blood pressure", "bp"), opt("Overweight", "weight"), NONE]);
    if (issue === "rls" && !asked(s, "rls_signs")) return q("rls_signs", "Do any of these apply?", "multi", [opt("Worse in the evening, eased by moving", "pattern"), opt("Pregnant", "pregnant"), opt("Low iron or kidney problems", "iron"), NONE]);
    return null;
  },
  screen: (s, _f, _e, u) => {
    if (has(s, "sleep_redflags", "driving")) u.push("Falling asleep while driving — please don't drive until this has been checked");
    if (has(s, "sleep_redflags", "cardiac")) u.push("Breathlessness lying flat or chest pain at night");
    if (has(s, "sleep_redflags", "mood")) u.push("Low mood with sleep problems — please talk to someone today; a crisis line is available any time");
  },
  possibilities: (s) => {
    const issue = s.answers.sleep_issue;
    if (issue === "apnoea" || (issue === "sleepy" && (has(s, "sleep_redflags", "witnessed") || has(s, "apnoea_signs", "snoring")))) return ["obstructive sleep apnoea, where the airway narrows during sleep and breathing briefly stops"];
    if (issue === "sleepy") return ["not enough, or poor-quality, sleep", "low iron, thyroid problems or low mood, which a doctor can check", "less commonly, narcolepsy"];
    if (issue === "rls") return ["restless legs syndrome, which can be linked to low iron, pregnancy or kidney problems"];
    if (issue === "parasomnia") return ["nightmares or sleepwalking, often made worse by stress, alcohol or poor sleep"];
    const p: string[] = [];
    if (has(s, "sleep_habits", "worry")) p.push("insomnia linked to stress or anxiety");
    if (has(s, "sleep_habits", "screens") || has(s, "sleep_habits", "caffeine") || has(s, "sleep_habits", "shifts")) p.push("sleep habits like screens, caffeine or changing shifts");
    if (has(s, "sleep_habits", "nocturia")) p.push("needing to pee at night, which can be from drinking late, diabetes or the prostate");
    if (has(s, "sleep_habits", "pain")) p.push("pain disturbing sleep");
    return p.length ? p : ["insomnia, which is common and often improves with changes to routine"];
  },
  specialist: (s) =>
    s.answers.sleep_issue === "apnoea" || has(s, "sleep_redflags", "witnessed")
      ? { speciality: "Pulmonologist", reason: "A Pulmonologist (chest and sleep specialist) can arrange a sleep study to check for sleep apnoea." }
      : { speciality: "General Physician", reason: "A General Physician can look for causes and suggest proven help such as CBT for insomnia." },
  needsReview: (s) => {
    if (s.answers.sleep_issue === "apnoea" || has(s, "sleep_redflags", "witnessed")) return "possible sleep apnoea should be checked";
    if (s.answers.sleep_issue === "rls") return "a simple blood test can check iron levels";
    if (s.answers.sleep_issue === "sleepy") return "daytime sleepiness that affects you is worth checking";
    if (s.onset === "over_3_months") return "it has gone on for more than 3 months";
    return null;
  },
  selfCare: (s) =>
    s.answers.sleep_issue === "apnoea"
      ? ["Sleep on your side rather than your back", "Avoid alcohol and sleeping pills in the evening", "Losing weight helps if you're overweight", "Don't drive when you feel drowsy"]
      : s.answers.sleep_issue === "rls"
        ? ["Stretching, a warm bath or a short walk before bed can ease symptoms", "Cut down on caffeine and alcohol", "Keep a regular sleep routine"]
        : ["Wake up at the same time every day, even at weekends", "Avoid screens for an hour before bed, and caffeine after 2pm", "If you can't sleep after about 20 minutes, get up and do something calm until you feel sleepy", "Don't take sleeping pills unless a doctor advises them"],
  watchFor: () => ["Falling asleep while driving or at work", "Someone sees you stop breathing in your sleep", "Low mood or thoughts of not wanting to be alive"],
  phrase: (s) => ({ insomnia: "trouble sleeping", apnoea: "snoring or breathing pauses at night", sleepy: "daytime sleepiness", rls: "restless legs", parasomnia: "nightmares or sleepwalking" } as Record<string, string>)[s.answers.sleep_issue ?? ""] ?? "sleep problem",
};

// ----------------------------------------------------------------------------------------------- pregnancy & after birth

const pregnancy: MoreModule = {
  multiKeys: ["preg_redflags"],
  next: (s) => {
    if (!asked(s, "preg_stage"))
      return q("preg_stage", "How far along is the pregnancy?", "chips", [opt("Under 12 weeks", "early"), opt("12–24 weeks", "mid"), opt("24 weeks or more", "late"), opt("Had a baby in the last 6 weeks", "postpartum")]);
    const stage = s.answers.preg_stage;
    if (!asked(s, "preg_redflags")) {
      const options =
        stage === "postpartum"
          ? [opt("Heavy bleeding (soaking a pad in an hour) or large clots", "pph"), opt("Breathless or chest pain", "pe"), opt("One leg swollen or painful", "dvt"), opt("Fever or shivering", "fever"), opt("Severe headache or vision changes", "headache"), opt("A red, hot, painful breast with fever", "mastitis"), opt("Thoughts of harming yourself or the baby", "harm"), NONE]
          : [
              opt("Heavy bleeding, or bleeding with pain", "bleeding"),
              opt("Severe tummy pain", "pain"),
              ...(stage === "early" ? [opt("Fainting, or one-sided pain with shoulder-tip pain", "ectopic")] : []),
              ...(stage !== "early" ? [opt("Severe headache, vision changes or sudden swelling of the face or hands", "pet")] : []),
              ...(stage === "late" ? [opt("The baby is moving less than usual", "movement")] : []),
              ...(stage !== "early" ? [opt("Waters leaking or breaking", "waters")] : []),
              opt("Fever of 38°C or higher", "fever"),
              opt("Can't keep any fluids down", "hyperemesis"),
              opt("Thoughts of harming yourself", "harm"),
              NONE,
            ];
      return q("preg_redflags", "First, are any of these happening?", "multi", options);
    }
    if (!asked(s, "preg_concern"))
      return stage === "postpartum"
        ? q("preg_concern", "What's worrying you?", "chips", [opt("Breastfeeding problems", "breastfeeding"), opt("Low mood or anxiety", "mood"), opt("Pain or stitches", "stitches"), opt("Something else", "other")])
        : q("preg_concern", "What's worrying you?", "chips", [opt("Nausea or vomiting", "nausea"), opt("Back or pelvic pain", "pelvic"), opt("Heartburn", "heartburn"), opt("Itching, especially hands and feet", "itch"), opt("Swollen feet and ankles", "swelling"), opt("Low mood or anxiety", "mood"), opt("Something else", "other")]);
    return null;
  },
  screen: (s, _f, e, u) => {
    for (const [v, label] of [
      ["bleeding", "Heavy bleeding, or bleeding with pain, in pregnancy"],
      ["pain", "Severe tummy pain in pregnancy"],
      ["ectopic", "Fainting or one-sided pain with shoulder-tip pain in early pregnancy — an ectopic pregnancy needs ruling out now"],
      ["pph", "Heavy bleeding after birth"],
      ["pe", "Breathlessness or chest pain after birth — a blood clot needs ruling out now"],
      ["harm", "Thoughts of harming yourself or the baby"],
    ] as const)
      if (has(s, "preg_redflags", v)) e.push(label);
    for (const [v, label] of [
      ["pet", "Severe headache, vision changes or sudden swelling — pre-eclampsia needs checking today"],
      ["movement", "The baby moving less than usual — contact your maternity unit now, don't wait until tomorrow"],
      ["waters", "Waters leaking or breaking"],
      ["fever", "Fever during pregnancy or after birth"],
      ["hyperemesis", "Can't keep fluids down in pregnancy"],
      ["dvt", "One leg swollen or painful after birth — a blood clot needs ruling out today"],
      ["headache", "Severe headache or vision changes after birth — pre-eclampsia can happen after delivery too"],
      ["mastitis", "A red, hot, painful breast with fever"],
    ] as const)
      if (has(s, "preg_redflags", v)) u.push(label);
  },
  possibilities: (s) =>
    (
      {
        nausea: ["pregnancy sickness, which usually eases by 16–20 weeks"],
        pelvic: ["pregnancy-related pelvic girdle pain", "back strain from the changing posture of pregnancy"],
        heartburn: ["pregnancy heartburn, which is very common as the baby grows"],
        itch: ["obstetric cholestasis, a liver condition in pregnancy that needs a blood test", "dry or stretching skin"],
        swelling: ["normal pregnancy swelling, which is common later in the day — sudden swelling of the face or hands needs checking"],
        mood: [s.answers.preg_stage === "postpartum" ? "postnatal depression or anxiety, which are common and treatable — or the 'baby blues' if it's in the first two weeks" : "antenatal depression or anxiety, which are common and treatable"],
        breastfeeding: ["latch or positioning difficulties", "a blocked milk duct or mastitis, if a breast is sore and red"],
        stitches: ["normal healing, which takes a few weeks", "an infection, if the area is red, hot, oozing or smelly"],
      } as Record<string, string[]>
    )[s.answers.preg_concern ?? ""] ?? [],
  specialist: (s) =>
    s.answers.preg_concern === "mood"
      ? { speciality: "Psychiatrist", reason: "A Psychiatrist (or your obstetrician) can help with mood during or after pregnancy, including treatments that are safe while pregnant or breastfeeding." }
      : s.answers.preg_concern === "breastfeeding"
        ? { speciality: "Lactation Consultant", reason: "A lactation consultant can watch a feed and help with latch and positioning." }
        : { speciality: "Gynaecologist", reason: "Your Gynaecologist (obstetrician) or midwife knows your pregnancy and is the right first contact." },
  needsReview: (s) =>
    (
      {
        itch: "itching in pregnancy needs a blood test",
        mood: "mood changes in or after pregnancy deserve support",
        nausea: null,
        pelvic: "pelvic pain often improves with physiotherapy",
        breastfeeding: "early help makes breastfeeding easier",
        stitches: null,
        heartburn: null,
        swelling: null,
        other: "it's worth mentioning to your doctor or midwife",
      } as Record<string, string | null>
    )[s.answers.preg_concern ?? ""] ?? null,
  selfCare: (s) =>
    (
      {
        nausea: ["Eat small, plain snacks often — dry crackers before getting up can help", "Sip fluids through the day", "Ginger may help some people", "Get help today if you can't keep fluids down"],
        pelvic: ["Keep your knees together when getting in and out of bed or a car", "Avoid standing on one leg; sit down to dress", "Rest when you can, with a pillow between your knees"],
        heartburn: ["Eat smaller meals, and avoid eating late", "Raise the head of your bed slightly", "Ask your doctor or pharmacist which antacids are safe in pregnancy"],
        itch: ["Wear loose cotton clothing and use a plain moisturiser", "Contact your doctor or midwife for a blood test"],
        swelling: ["Rest with your feet raised when you can", "Wear comfortable shoes and avoid standing for long", "Check your blood pressure at your next visit"],
        mood: ["Talk to someone you trust, and tell your doctor or midwife how you're feeling", "Rest when you can, and accept help with the baby or home"],
        breastfeeding: ["Feed often, making sure the baby's mouth covers much of the areola", "Try different positions", "Keep feeding from a sore breast if you can — it helps clear blocked ducts"],
        stitches: ["Keep the area clean and dry; pour warm water over it when you pee", "Paracetamol is generally considered safe while breastfeeding — check with your doctor"],
      } as Record<string, string[]>
    )[s.answers.preg_concern ?? ""] ?? ["Mention this at your next check-up, or sooner if it worries you"],
  watchFor: (s) =>
    s.answers.preg_stage === "postpartum"
      ? ["Heavy bleeding or large clots", "Fever, or a red, hot breast", "Breathlessness, chest pain or a swollen leg", "Severe headache or vision changes", "Thoughts of harming yourself or the baby"]
      : ["Bleeding or severe tummy pain", "Severe headache, vision changes or sudden swelling", "The baby moving less than usual", "Waters leaking or breaking", "Fever"],
  phrase: (s) => (s.answers.preg_stage === "postpartum" ? "concern after birth" : ({ nausea: "pregnancy sickness", pelvic: "pelvic pain in pregnancy", heartburn: "heartburn in pregnancy", itch: "itching in pregnancy", swelling: "swelling in pregnancy", mood: "low mood in pregnancy" } as Record<string, string>)[s.answers.preg_concern ?? ""] ?? "pregnancy concern"),
};

export const MORE_MODULES: Partial<Record<Complaint, MoreModule>> = { ent, dental, urinary, sleep, pregnancy };
export const MORE_MULTI_KEYS = Object.values(MORE_MODULES).flatMap((m) => m!.multiKeys);
export const moreModule = (c: Complaint | null | undefined) => (c ? MORE_MODULES[c] : undefined);
