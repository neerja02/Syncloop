/**
 * Head-to-toe anatomy for musculoskeletal pain: body region → sub-location → structures, with left/right.
 *
 * Each region narrows the location first, screens its own warning signs, asks one or two pattern questions
 * that tell common causes apart, then offers cautiously worded possibilities (never a diagnosis), safe
 * self-care and who to see. Adding a region is a data change; the conversation engine doesn't change.
 * Demo content — requires clinical review before production use.
 */
import type { GuidedState, QuestionDef } from "./types";

export type RegionId = "neck" | "shoulder" | "elbow" | "wrist_hand" | "hip" | "knee" | "calf" | "ankle_foot";

export interface RegionFacts {
  isSelf: boolean;
  name: string;
  age: number | null;
  conditions: string[];
}

type Opt = { label: string; value: string; exclusive?: boolean };
const opt = (label: string, value: string): Opt => ({ label, value });
const NONE: Opt = { label: "None of these", value: "none", exclusive: true };
const q = (key: string, text: string, style: QuestionDef["style"], options: Opt[]): QuestionDef => ({ key, text, style, options });
const yesNo = [opt("Yes", "yes"), opt("No", "no"), opt("Not sure", "unsure")];
const has = (s: GuidedState, key: string, v: string) => (s.answers[key] ?? "").split("|").includes(v);
const asked = (s: GuidedState, k: string) => s.answers[k] != null;
const diabetic = (f: RegionFacts) => f.conditions.some((c) => /diabet/i.test(c));

interface RegionDef {
  label: string;
  /** Anatomical path, e.g. ["Lower limb", "Foot"]; the chosen sub-location is appended. */
  path: string[];
  limb: boolean;
  spot: (s: GuidedState) => { text: string; options: Opt[] } | null;
  redFlags: (f: RegionFacts) => { text: string; options: Opt[] };
  screen: (s: GuidedState, f: RegionFacts, e: string[], u: string[]) => void;
  /** One or two questions that tell common causes apart, chosen from earlier answers. */
  pattern: (s: GuidedState, f: RegionFacts) => QuestionDef | null;
  possibilities: (s: GuidedState, f: RegionFacts) => string[];
  selfCare: (s: GuidedState) => string[];
  watchFor: (s: GuidedState) => string[];
  specialist: (s: GuidedState, f: RegionFacts) => { speciality: string; reason: string };
  needsReview: (s: GuidedState, f: RegionFacts) => string | null;
  phrase: (s: GuidedState) => string;
}

const ORTHO = "Orthopaedic Doctor";
const PHYSIO = "Physiotherapist";
const GP = "General Physician";

/** Shared reasons a musculoskeletal problem deserves a check, regardless of region. */
function commonReview(s: GuidedState): string | null {
  if (s.severity === "severe") return "the pain is severe";
  if (s.trend === "worse" && s.severity === "moderate") return "it's moderate and getting worse";
  if (s.onset === "over_week" && s.trend !== "better") return "it has lasted more than a week without improving";
  return null;
}

const REGIONS: Record<RegionId, RegionDef> = {
  // ------------------------------------------------------------------------------------------- knee
  knee: {
    label: "knee",
    path: ["Lower limb", "Knee"],
    limb: true,
    spot: () => ({ text: "Is the pain at the front, back, inner side or outer side of your knee?", options: [opt("Front or kneecap", "front"), opt("Back of the knee", "back"), opt("Inner side", "inner"), opt("Outer side", "outer"), opt("All over or swollen", "whole")] }),
    redFlags: () => ({
      text: "Do any of these apply?",
      options: [opt("Can't put weight on it", "cant_bear"), opt("Heard a pop, then it swelled quickly", "pop"), opt("Hot, red and swollen", "hot"), opt("Fever", "fever"), opt("Looks out of shape", "deformity"), opt("The calf is swollen or painful too", "calf"), NONE],
    }),
    screen: (s, _f, e, u) => {
      if (has(s, "knee_redflags", "cant_bear")) u.push("Can't put weight on the knee");
      if (has(s, "knee_redflags", "pop")) u.push("A pop followed by quick swelling — a ligament injury needs checking");
      if (has(s, "knee_redflags", "deformity")) u.push("A knee that looks out of shape");
      if (has(s, "knee_redflags", "hot")) u.push(has(s, "knee_redflags", "fever") ? "A hot, swollen knee with fever — a joint infection needs ruling out" : "A hot, red, swollen knee");
      if (has(s, "knee_redflags", "calf")) u.push("Knee pain with a swollen or painful calf — a blood clot needs ruling out");
    },
    pattern: (s) => {
      const spot = s.answers.knee_spot;
      if (spot === "front" && !asked(s, "knee_trigger"))
        return q("knee_trigger", "Does it hurt more while climbing stairs, squatting or walking?", "multi", [opt("Climbing stairs", "stairs"), opt("Squatting or kneeling", "squat"), opt("After sitting for a long time", "sitting"), opt("Running or jumping", "running"), opt("Walking", "walking"), opt("It hurts all the time", "constant")]);
      if ((spot === "inner" || spot === "outer") && !asked(s, "knee_twist")) return q("knee_twist", "Did it start with a twist, knock or sports injury?", "yesno", yesNo);
      if ((spot === "inner" || spot === "outer" || spot === "whole") && !asked(s, "knee_locking")) return q("knee_locking", "Does the knee click, catch, lock or give way?", "yesno", yesNo);
      if (spot === "back" && !asked(s, "knee_lump")) return q("knee_lump", "Is there a lump or a tight, full feeling behind the knee?", "yesno", yesNo);
      if (spot === "whole" && !asked(s, "knee_stiffness")) return q("knee_stiffness", "Is it stiff in the morning for more than 30 minutes?", "yesno", yesNo);
      return null;
    },
    possibilities: (s, f) => {
      const spot = s.answers.knee_spot;
      const p: string[] = [];
      if (spot === "front") {
        p.push("irritation where the kneecap glides over the thigh bone (patellofemoral pain), which often hurts on stairs, squatting or after sitting");
        if (has(s, "knee_trigger", "running")) p.push("irritation of the tendon below the kneecap (patellar tendinopathy), common with running and jumping");
        if ((f.age ?? 0) >= 45) p.push("wear in the joint (osteoarthritis), which becomes more common after 45");
      } else if (spot === "inner" || spot === "outer") {
        if (s.answers.knee_twist === "yes") p.push(`a sprain of the ligament on the ${spot} side`, "a tear of the knee cartilage (meniscus), especially if it clicks, catches or locks");
        else if (spot === "outer") p.push("irritation of the band of tissue on the outer thigh (iliotibial band), common in runners and cyclists");
        else p.push("irritation of the tendons and small fluid sac on the inner knee (pes anserine bursitis)", "wear in the joint (osteoarthritis)");
      } else if (spot === "back") {
        p.push(s.answers.knee_lump === "yes" ? "a fluid-filled swelling behind the knee (Baker's cyst)" : "a strain of the hamstring or calf muscle where it attaches behind the knee");
      } else {
        if (s.answers.knee_stiffness === "yes") p.push("an inflammatory arthritis, where the joint lining becomes inflamed");
        p.push("wear in the joint (osteoarthritis)", "fluid on the knee from irritation or an earlier injury");
      }
      return p;
    },
    selfCare: () => [
      "Ease off the activities that bring it on for a week or two, but keep moving gently",
      "A cold pack wrapped in a cloth for 15 minutes, a few times a day, can ease pain and swelling",
      "Wear supportive shoes and avoid deep squats and kneeling for now",
      "Start strengthening exercises once a clinician has checked it, especially if it began with an injury",
    ],
    watchFor: () => ["You can't put weight on it", "The knee becomes hot, red and swollen, or you get a fever", "It locks or keeps giving way", "Your calf becomes swollen or painful"],
    specialist: (s) => {
      if (s.answers.knee_twist === "yes" || s.answers.knee_locking === "yes") return { speciality: ORTHO, reason: "An Orthopaedic doctor commonly examines knees after a twisting injury, or when the knee catches or locks." };
      if (s.answers.knee_stiffness === "yes") return { speciality: "Rheumatologist", reason: "A Rheumatologist commonly evaluates joints that are stiff for a long time each morning." };
      return { speciality: PHYSIO, reason: "A Physiotherapist can examine the knee and give a strengthening plan for overuse pain like this." };
    },
    needsReview: (s) => (s.answers.knee_twist === "yes" ? "it started with an injury" : s.answers.knee_locking === "yes" ? "the knee clicks, catches or locks" : s.answers.knee_stiffness === "yes" ? "long morning stiffness should be checked" : commonReview(s)),
    phrase: (s) => ({ front: "front knee pain", back: "pain behind the knee", inner: "inner knee pain", outer: "outer knee pain" } as Record<string, string>)[s.answers.knee_spot ?? ""] ?? "knee pain",
  },

  // ------------------------------------------------------------------------------------------- ankle & foot
  ankle_foot: {
    label: "foot or ankle",
    path: ["Lower limb", "Foot"],
    limb: true,
    spot: (s) =>
      s.answers.foot_area === "heel"
        ? { text: "Is the pain underneath your heel, behind it or around its sides?", options: [opt("Underneath the heel", "heel_under"), opt("Behind the heel", "heel_back"), opt("Around the sides", "heel_sides")] }
        : { text: "Where exactly is it?", options: [opt("Underneath the heel", "heel_under"), opt("Back of the heel", "heel_back"), opt("Ankle", "ankle"), opt("Arch of the foot", "arch"), opt("Ball of the foot or toes", "forefoot"), opt("Burning or numb feet", "burning")] },
    redFlags: (f) => ({
      text: "Do any of these apply?",
      options: [
        opt("Can't put weight on it", "cant_bear"),
        opt("Started after a fall, twist or injury", "injury"),
        opt("Felt a sudden snap or kick at the back of the ankle", "snap"),
        opt("Red, hot and swollen", "hot"),
        opt("The foot is cold, pale or blue", "cold_foot"),
        opt(diabetic(f) ? "A wound or sore that isn't healing (with diabetes)" : "A wound or sore that isn't healing", "ulcer"),
        NONE,
      ],
    }),
    screen: (s, f, e, u) => {
      if (has(s, "ankle_foot_redflags", "cold_foot")) e.push("A cold, pale or blue foot — the blood supply may be blocked");
      if (has(s, "ankle_foot_redflags", "cant_bear") && has(s, "ankle_foot_redflags", "injury")) u.push("Can't put weight on the foot after an injury — a fracture needs ruling out");
      else if (has(s, "ankle_foot_redflags", "cant_bear")) u.push("Can't put weight on the foot");
      if (has(s, "ankle_foot_redflags", "snap")) u.push("A snap at the back of the ankle — the Achilles tendon may be torn");
      if (has(s, "ankle_foot_redflags", "hot")) u.push("A red, hot, swollen foot — infection or gout needs checking");
      if (has(s, "ankle_foot_redflags", "ulcer") && diabetic(f)) u.push("A foot wound that isn't healing, with diabetes");
    },
    pattern: (s) => {
      const spot = s.answers.ankle_foot_spot;
      if (spot === "heel_under" && !asked(s, "heel_morning")) return q("heel_morning", "Is it particularly painful when you take your first few steps after waking up, or after resting?", "yesno", yesNo);
      if ((spot === "heel_under" || spot === "heel_sides") && !asked(s, "heel_start")) return q("heel_start", "Did the pain begin gradually, or did it start after an injury or unusual activity?", "chips", [opt("Gradually", "gradual"), opt("After an injury", "injury"), opt("After more walking, running or standing than usual", "activity")]);
      if (spot === "heel_back" && !asked(s, "achilles_load")) return q("achilles_load", "Is it worse when you walk uphill, run, or go up on your tiptoes?", "yesno", yesNo);
      if (spot === "arch" && !asked(s, "arch_standing")) return q("arch_standing", "Is it worse after standing or walking for a long time?", "yesno", yesNo);
      if (spot === "forefoot" && !asked(s, "forefoot_feel")) return q("forefoot_feel", "What does it feel like?", "chips", [opt("Like walking on a pebble", "pebble"), opt("Tingling or numb toes", "tingling"), opt("Sharp pain in one spot", "point"), opt("Swollen, painful big toe joint", "big_toe")]);
      if (spot === "burning" && !asked(s, "burning_context")) return q("burning_context", "Do any of these apply?", "multi", [opt("Diabetes", "diabetes"), opt("Drink alcohol most days", "alcohol"), opt("Vegetarian or vegan diet", "veg"), opt("Both feet are affected", "both"), opt("Itchy, peeling skin between the toes", "fungal"), NONE]);
      return null;
    },
    possibilities: (s) => {
      const spot = s.answers.ankle_foot_spot;
      switch (spot) {
        case "heel_under":
          return s.answers.heel_morning === "yes"
            ? ["irritation of the thick band under the foot (plantar fasciopathy), the most common cause of heel pain that's worst with the first steps", "irritation of the heel's fat pad", ...(s.answers.heel_start === "activity" ? ["a stress injury of the heel bone, which tends to hurt more the longer you're on your feet"] : [])]
            : ["irritation of the heel's fat pad", "a stress injury of the heel bone, especially after a jump in activity", "nerve irritation, if there's burning or tingling"];
        case "heel_sides":
          return ["a stress injury of the heel bone", "irritation of a nerve on the inner side of the ankle (tarsal tunnel)"];
        case "heel_back":
          return [s.answers.achilles_load === "yes" ? "irritation of the Achilles tendon (Achilles tendinopathy)" : "an irritated fluid sac at the back of the heel (bursitis)", "pressure from the back of a shoe"];
        case "ankle":
          return has(s, "ankle_foot_redflags", "injury") ? ["a sprain of the ankle ligaments", "a fracture, which needs an X-ray if you couldn't walk afterwards"] : ["irritation of the tendons around the ankle", "wear or inflammation in the ankle joint"];
        case "arch":
          return ["strain of the plantar fascia", "strain of the tendon that supports the arch (tibialis posterior), especially with flat feet"];
        case "forefoot":
          return s.answers.forefoot_feel === "tingling"
            ? ["a pinched nerve between the toes (Morton's neuroma)", "nerve damage in the feet (peripheral neuropathy)"]
            : s.answers.forefoot_feel === "big_toe"
              ? ["gout, a type of arthritis that often starts in the big toe", "wear in the big toe joint"]
              : ["overload of the ball of the foot (metatarsalgia)", "a stress fracture of a foot bone, especially if one spot is tender"];
        case "burning":
          return has(s, "burning_context", "fungal")
            ? ["a fungal skin infection (athlete's foot)", "nerve damage in the feet (peripheral neuropathy)"]
            : ["nerve damage in the feet (peripheral neuropathy), which is common with diabetes, low vitamin B12 or regular alcohol", "less commonly, thyroid problems or some medicines"];
      }
      return [];
    },
    selfCare: (s) =>
      s.answers.ankle_foot_spot === "burning"
        ? ["Check your feet every day for cuts, blisters or sores", "Don't walk barefoot, and test bath water with your hand first", "If you have diabetes, keeping blood sugar in range helps protect the nerves"]
        : [
            "Wear cushioned, supportive shoes, and avoid walking barefoot on hard floors",
            "Ease back on running or long periods of standing for now",
            "A cold pack wrapped in a cloth for 15 minutes after activity can help",
            ...(s.answers.ankle_foot_spot === "heel_under" && !has(s, "ankle_foot_redflags", "injury") ? ["Gentle calf and sole stretches, especially before the first steps of the day, often help this kind of heel pain"] : []),
          ],
    watchFor: () => ["You can't walk or put weight on it", "The foot becomes red, hot and swollen, or you get a fever", "The foot turns cold, pale or blue", "A wound or sore that isn't healing"],
    specialist: (s, f) => {
      if (s.answers.ankle_foot_spot === "burning") return { speciality: diabetic(f) ? "Diabetologist" : GP, reason: "A doctor can check for common causes of burning feet with simple tests such as blood sugar and vitamin B12." };
      if (has(s, "ankle_foot_redflags", "injury") || s.answers.forefoot_feel === "point") return { speciality: ORTHO, reason: "An Orthopaedic doctor can examine the foot and arrange an X-ray if a bone injury is possible." };
      if (diabetic(f)) return { speciality: GP, reason: "With diabetes, a General Physician should check the foot, circulation and sugar control first, and can refer you to a Physiotherapist if needed." };
      return { speciality: PHYSIO, reason: "A Physiotherapist commonly treats heel, arch and tendon pain like this with a targeted plan." };
    },
    needsReview: (s, f) => {
      const spot = s.answers.ankle_foot_spot;
      if (spot === "burning") return "burning or numb feet are worth testing for a cause";
      if (has(s, "ankle_foot_redflags", "ulcer")) return "a wound that isn't healing needs to be looked at";
      if (has(s, "ankle_foot_redflags", "injury")) return "it started with an injury";
      if (s.answers.forefoot_feel === "big_toe") return "a hot, swollen big toe joint is worth checking for gout";
      return commonReview(s) ?? (diabetic(f) ? "foot problems with diabetes are best checked early" : null);
    },
    phrase: (s) => ({ heel_under: "heel pain", heel_back: "pain at the back of the heel", heel_sides: "heel pain", ankle: "ankle pain", arch: "arch pain", forefoot: "pain in the ball of the foot", burning: "burning feet" } as Record<string, string>)[s.answers.ankle_foot_spot ?? ""] ?? "foot pain",
  },

  // ------------------------------------------------------------------------------------------- elbow
  elbow: {
    label: "elbow",
    path: ["Upper limb", "Elbow"],
    limb: true,
    spot: () => ({ text: "Is the pain on the inner side, outer side, front or back of the elbow?", options: [opt("Outer side", "outer"), opt("Inner side", "inner"), opt("Front", "front"), opt("Back (the tip of the elbow)", "back")] }),
    redFlags: () => ({ text: "Do any of these apply?", options: [opt("Started after a fall or injury", "injury"), opt("Can't bend or straighten it", "cant_move"), opt("Looks out of shape", "deformity"), opt("Red, hot and swollen", "hot"), opt("Fever", "fever"), NONE] }),
    screen: (s, _f, e, u) => {
      if (has(s, "elbow_redflags", "deformity")) u.push("An elbow that looks out of shape");
      if (has(s, "elbow_redflags", "injury") && has(s, "elbow_redflags", "cant_move")) u.push("Can't bend or straighten the elbow after an injury");
      if (has(s, "elbow_redflags", "hot")) u.push(has(s, "elbow_redflags", "fever") ? "A hot, swollen elbow with fever — an infection needs ruling out" : "A red, hot, swollen elbow");
    },
    pattern: (s) => {
      const spot = s.answers.elbow_spot;
      if ((spot === "outer" || spot === "inner") && !asked(s, "elbow_grip")) return q("elbow_grip", "Does it become worse when you grip something, lift objects or twist your wrist?", "yesno", yesNo);
      if (spot === "inner" && !asked(s, "elbow_tingle")) return q("elbow_tingle", "Do your little and ring fingers tingle or go numb?", "yesno", yesNo);
      if (spot === "back" && !asked(s, "elbow_swelling")) return q("elbow_swelling", "Is there a soft swelling at the tip of the elbow?", "yesno", yesNo);
      if (spot === "front" && !asked(s, "elbow_lift")) return q("elbow_lift", "Is it worse when lifting with your palm facing up?", "yesno", yesNo);
      return null;
    },
    possibilities: (s) => {
      switch (s.answers.elbow_spot) {
        case "outer":
          return s.answers.elbow_grip === "yes" ? ["irritation of the tendons on the outer elbow (tennis elbow, or lateral elbow tendinopathy)", "less often, a pinched nerve in the neck referring pain to the elbow"] : ["a strain of the forearm muscles", "pain referred from the neck"];
        case "inner":
          return [...(s.answers.elbow_grip === "yes" ? ["irritation of the tendons on the inner elbow (golfer's elbow)"] : []), ...(s.answers.elbow_tingle === "yes" ? ["pressure on the ulnar nerve at the elbow, which causes tingling in the little and ring fingers"] : ["a strain of the forearm muscles"])];
        case "back":
          return s.answers.elbow_swelling === "yes" ? ["a swollen fluid sac at the tip of the elbow (olecranon bursitis)"] : ["irritation of the triceps tendon"];
        case "front":
          return ["a strain of the biceps tendon at the elbow"];
      }
      return [];
    },
    selfCare: () => ["Rest from the movements that hurt, like heavy gripping or lifting with a straight arm", "Lift with your palm facing up, and keep objects close to your body", "A cold pack wrapped in a cloth for 15 minutes can ease pain", "Take regular breaks from typing, tools or racquet sports"],
    watchFor: () => ["The elbow becomes hot, red and swollen, or you get a fever", "You can't bend or straighten it", "Numbness or weakness in the hand"],
    specialist: (s) => (has(s, "elbow_redflags", "injury") ? { speciality: ORTHO, reason: "An Orthopaedic doctor can examine the elbow after an injury and arrange an X-ray if needed." } : s.answers.elbow_tingle === "yes" ? { speciality: GP, reason: "A General Physician can check the nerve and decide whether nerve tests are needed." } : { speciality: PHYSIO, reason: "A Physiotherapist commonly treats tendon pain around the elbow with a targeted exercise plan." }),
    needsReview: (s) => (has(s, "elbow_redflags", "injury") ? "it started with an injury" : s.answers.elbow_tingle === "yes" ? "tingling fingers suggest a nerve is involved" : commonReview(s)),
    phrase: (s) => ({ outer: "outer elbow pain", inner: "inner elbow pain", back: "pain at the tip of the elbow", front: "front elbow pain" } as Record<string, string>)[s.answers.elbow_spot ?? ""] ?? "elbow pain",
  },

  // ------------------------------------------------------------------------------------------- wrist & hand
  wrist_hand: {
    label: "wrist or hand",
    path: ["Upper limb", "Hand"],
    limb: true,
    spot: () => ({ text: "Where exactly is it?", options: [opt("Wrist", "wrist"), opt("Thumb, or the base of the thumb", "thumb"), opt("Fingers", "fingers"), opt("Palm", "palm"), opt("Numbness or tingling in the hand", "numb")] }),
    redFlags: () => ({
      text: "Do any of these apply?",
      options: [opt("Sudden weakness in the hand or arm", "weakness"), opt("After a fall on an outstretched hand", "fall"), opt("Looks out of shape", "deformity"), opt("A finger is cold, pale or blue", "cold"), opt("A deep cut, with numbness or a finger that won't bend", "cut"), opt("Red, hot and swollen", "hot"), NONE],
    }),
    screen: (s, _f, e, u) => {
      if (has(s, "wrist_hand_redflags", "weakness")) e.push("Sudden weakness in a hand or arm — a stroke needs ruling out");
      if (has(s, "wrist_hand_redflags", "cold")) e.push("A cold, pale or blue finger — the blood supply may be blocked");
      if (has(s, "wrist_hand_redflags", "deformity")) u.push("A wrist or finger that looks out of shape");
      else if (has(s, "wrist_hand_redflags", "fall")) u.push("Wrist pain after a fall on an outstretched hand — a fracture needs ruling out");
      if (has(s, "wrist_hand_redflags", "cut")) u.push("A deep cut with numbness or a finger that won't bend — a nerve or tendon may be injured");
      if (has(s, "wrist_hand_redflags", "hot")) u.push("A red, hot, swollen hand or finger — infection needs checking");
    },
    pattern: (s) => {
      const spot = s.answers.wrist_hand_spot;
      if (spot === "numb" && !asked(s, "hand_fingers")) return q("hand_fingers", "Which fingers are affected?", "chips", [opt("Thumb, index and middle fingers", "median"), opt("Little and ring fingers", "ulnar"), opt("All of the fingers", "all"), opt("Not sure", "unsure")]);
      if (spot === "numb" && !asked(s, "hand_night")) return q("hand_night", "Is it worse at night or when you wake up?", "yesno", yesNo);
      if (spot === "thumb" && !asked(s, "thumb_grip")) return q("thumb_grip", "Does it hurt when you grip or twist, like opening a jar or turning a key?", "yesno", yesNo);
      if (spot === "fingers" && !asked(s, "finger_click")) return q("finger_click", "Does a finger click or get stuck when you bend it?", "yesno", yesNo);
      if ((spot === "fingers" || spot === "wrist") && !asked(s, "hand_stiffness")) return q("hand_stiffness", "Are the joints stiff or swollen in the morning for more than 30 minutes?", "yesno", yesNo);
      if ((spot === "wrist" || spot === "palm") && !asked(s, "hand_repetitive")) return q("hand_repetitive", "Is it worse with typing, phone use or repeated movements?", "yesno", yesNo);
      return null;
    },
    possibilities: (s) => {
      switch (s.answers.wrist_hand_spot) {
        case "numb":
          return s.answers.hand_fingers === "median"
            ? [`pressure on the median nerve at the wrist (carpal tunnel syndrome)${s.answers.hand_night === "yes" ? ", which is typically worse at night" : ""}`, "a pinched nerve in the neck"]
            : s.answers.hand_fingers === "ulnar"
              ? ["pressure on the ulnar nerve at the elbow or wrist"]
              : ["a pinched nerve in the neck", "nerve damage from diabetes or low vitamin B12", "carpal tunnel syndrome"];
        case "thumb":
          return s.answers.thumb_grip === "yes" ? ["irritation of the tendons at the base of the thumb (De Quervain's)", "wear in the joint at the base of the thumb (arthritis)"] : ["wear in the joint at the base of the thumb", "a sprain of the thumb ligament"];
        case "fingers":
          return [...(s.answers.finger_click === "yes" ? ["trigger finger, where a tendon catches as the finger bends"] : []), ...(s.answers.hand_stiffness === "yes" ? ["an inflammatory arthritis such as rheumatoid arthritis"] : ["wear in the finger joints (osteoarthritis)"])];
        case "wrist":
          return [...(s.answers.hand_repetitive === "yes" ? ["irritation of the wrist tendons from repeated movements (repetitive strain)"] : []), ...(s.answers.hand_stiffness === "yes" ? ["an inflammatory arthritis"] : ["a wrist sprain", "a fluid-filled lump on the wrist (ganglion cyst), if there's a swelling"])];
        case "palm":
          return ["strain from repeated gripping", "thickening of the tissue in the palm (Dupuytren's), if there's a firm cord or lump"];
      }
      return [];
    },
    selfCare: (s) => [
      "Take regular breaks from gripping, typing or phone use, and change position often",
      ...(s.answers.wrist_hand_spot === "numb" ? ["A wrist splint worn at night can ease tingling from carpal tunnel"] : []),
      "A cold pack wrapped in a cloth for 10–15 minutes can ease swelling",
      "Avoid heavy lifting with that hand for now",
    ],
    watchFor: () => ["Sudden weakness in the hand or arm, or a drooping face or slurred speech", "A finger turns cold, pale or blue", "The hand becomes red, hot and swollen", "Numbness that spreads or doesn't go away"],
    specialist: (s) => {
      if (s.answers.hand_stiffness === "yes") return { speciality: "Rheumatologist", reason: "A Rheumatologist commonly evaluates joints that are stiff or swollen each morning." };
      if (s.answers.wrist_hand_spot === "numb" && s.answers.hand_fingers === "all") return { speciality: GP, reason: "A General Physician can look for common causes such as diabetes or low vitamin B12, and arrange nerve tests if needed." };
      if (s.answers.wrist_hand_spot === "numb" || s.answers.finger_click === "yes" || has(s, "wrist_hand_redflags", "fall")) return { speciality: ORTHO, reason: "An Orthopaedic doctor commonly treats carpal tunnel syndrome, trigger finger and wrist injuries." };
      return { speciality: PHYSIO, reason: "A Physiotherapist can help with tendon strain and give exercises and advice on posture and breaks." };
    },
    needsReview: (s) => (s.answers.wrist_hand_spot === "numb" ? "numbness or tingling is worth checking" : s.answers.hand_stiffness === "yes" ? "long morning stiffness should be checked" : s.answers.finger_click === "yes" ? "a finger that catches often needs treatment" : commonReview(s)),
    phrase: (s) => ({ wrist: "wrist pain", thumb: "thumb pain", fingers: "finger pain", palm: "palm pain", numb: "numb or tingling hand" } as Record<string, string>)[s.answers.wrist_hand_spot ?? ""] ?? "hand pain",
  },

  // ------------------------------------------------------------------------------------------- shoulder
  shoulder: {
    label: "shoulder",
    path: ["Upper limb", "Shoulder"],
    limb: true,
    spot: () => ({ text: "Where in the shoulder is it?", options: [opt("Top or front of the shoulder", "front"), opt("Outer side, down towards the arm", "outer"), opt("Back of the shoulder or shoulder blade", "back"), opt("All around, and very stiff", "stiff")] }),
    redFlags: () => ({
      text: "Do any of these apply?",
      options: [opt("Chest pressure, sweating or breathlessness with it", "cardiac"), opt("After a fall, and can't lift the arm", "injury"), opt("Looks out of shape", "deformity"), opt("Red, hot and swollen, or a fever", "hot"), opt("Weakness or numbness down the arm", "neuro"), NONE],
    }),
    screen: (s, _f, e, u) => {
      if (has(s, "shoulder_redflags", "cardiac")) e.push("Shoulder or arm pain with chest pressure, sweating or breathlessness — this can be the heart");
      if (has(s, "shoulder_redflags", "deformity")) u.push("A shoulder that looks out of shape — possible dislocation");
      if (has(s, "shoulder_redflags", "injury")) u.push("Can't lift the arm after a fall");
      if (has(s, "shoulder_redflags", "hot")) u.push("A hot, swollen shoulder or fever — infection needs ruling out");
      if (has(s, "shoulder_redflags", "neuro")) u.push("Weakness or numbness down the arm");
    },
    pattern: (s) => {
      if (!asked(s, "shoulder_lift")) return q("shoulder_lift", "Can you lift your arm above your head?", "chips", [opt("Yes, without pain", "free"), opt("Yes, but it hurts on the way up", "arc"), opt("Only with help from the other hand", "weak"), opt("No, it's very stiff", "frozen")]);
      if (!asked(s, "shoulder_night")) return q("shoulder_night", "Does it wake you at night, especially lying on that side?", "yesno", yesNo);
      return null;
    },
    possibilities: (s, f) => {
      const lift = s.answers.shoulder_lift;
      if (lift === "frozen" || s.answers.shoulder_spot === "stiff") return [`a stiff, painful shoulder capsule (frozen shoulder)${diabetic(f) ? ", which is more common with diabetes" : ""}`, "wear in the shoulder joint"];
      if (lift === "arc") return ["irritation of the rotator cuff tendons as they pass under the shoulder bone (subacromial pain)", "inflammation of the fluid sac in the shoulder (bursitis)"];
      if (lift === "weak") return ["a tear of the rotator cuff tendons", "a nerve problem, which a clinician would check"];
      if (s.answers.shoulder_spot === "back") return ["a strain of the muscles around the shoulder blade, often from posture", "pain referred from the neck"];
      return ["a strain of the shoulder muscles or tendons", "pain referred from the neck"];
    },
    selfCare: () => ["Keep the shoulder moving gently within comfort; avoid a sling unless a doctor advises it", "Avoid lifting or reaching overhead for now", "A cold or warm pack, whichever feels better, for 15 minutes", "Sleep propped on pillows, and avoid lying on the painful side"],
    watchFor: () => ["Chest pain, sweating or breathlessness", "The shoulder becomes hot and swollen, or you get a fever", "Weakness or numbness down the arm"],
    specialist: (s) => (s.answers.shoulder_lift === "frozen" || s.answers.shoulder_lift === "weak" ? { speciality: ORTHO, reason: "An Orthopaedic doctor commonly evaluates a stiff or weak shoulder and can arrange a scan if needed." } : { speciality: PHYSIO, reason: "A Physiotherapist commonly treats rotator cuff and posture-related shoulder pain." }),
    needsReview: (s) => (s.answers.shoulder_lift === "frozen" || s.answers.shoulder_lift === "weak" ? "you can't lift the arm fully" : s.answers.shoulder_night === "yes" ? "it's disturbing your sleep" : commonReview(s)),
    phrase: () => "shoulder pain",
  },

  // ------------------------------------------------------------------------------------------- neck
  neck: {
    label: "neck",
    path: ["Head and neck", "Neck"],
    limb: false,
    spot: () => ({ text: "Where is the neck pain?", options: [opt("Back of the neck", "back"), opt("One side", "side"), opt("Spreads into the shoulder or arm", "radiating")] }),
    redFlags: () => ({
      text: "Do any of these apply?",
      options: [opt("Fever with a stiff neck or a severe headache", "meningitis"), opt("Started after an accident, fall or injury", "injury"), opt("Numbness, tingling or weakness in the arms or legs", "neuro"), opt("Trouble walking or keeping your balance", "balance"), opt("Losing weight without trying", "weight"), NONE],
    }),
    screen: (s, _f, e, u) => {
      if (has(s, "neck_redflags", "meningitis")) e.push("Fever with a stiff neck or severe headache — meningitis needs ruling out");
      if (has(s, "neck_redflags", "injury")) u.push("Neck pain after an accident or injury");
      if (has(s, "neck_redflags", "neuro")) u.push("Neck pain with numbness, tingling or weakness in the limbs");
      if (has(s, "neck_redflags", "balance")) u.push("Neck pain with trouble walking or keeping balance");
    },
    pattern: (s) => {
      if (s.answers.neck_spot === "radiating" && !asked(s, "neck_radiate")) return q("neck_radiate", "Does turning or tilting your head send pain or tingling down the arm?", "yesno", yesNo);
      if (!asked(s, "neck_posture")) return q("neck_posture", "Is it worse after long hours at a screen, on your phone or driving?", "yesno", yesNo);
      return null;
    },
    possibilities: (s, f) => [
      ...(s.answers.neck_radiate === "yes" ? ["a pinched nerve root in the neck (cervical radiculopathy)"] : []),
      ...(s.answers.neck_posture === "yes" ? ["muscle strain from posture, which is very common with screens and phones"] : ["a muscle strain, for example from sleeping awkwardly"]),
      ...((f.age ?? 0) >= 40 ? ["age-related wear in the neck joints (cervical spondylosis)"] : []),
    ],
    selfCare: () => ["Keep your neck gently moving; avoid long periods looking down at a phone", "Raise your screen to eye level and take a short break every 30–45 minutes", "A warm compress for 15 minutes can ease stiffness", "Use one supportive pillow rather than several"],
    watchFor: () => ["Fever with a stiff neck or a severe headache", "Numbness, tingling or weakness in the arms or legs", "Trouble walking or with balance", "Problems controlling your bladder or bowel"],
    specialist: (s) => (s.answers.neck_radiate === "yes" || has(s, "neck_redflags", "weight") ? { speciality: ORTHO, reason: "An Orthopaedic doctor commonly evaluates neck pain that spreads down the arm, and can arrange a scan if needed." } : { speciality: PHYSIO, reason: "A Physiotherapist commonly treats posture-related neck pain with exercises and advice." }),
    needsReview: (s) => (has(s, "neck_redflags", "weight") ? "unexplained weight loss should be checked" : s.answers.neck_radiate === "yes" ? "pain spreading down the arm suggests a nerve is involved" : commonReview(s)),
    phrase: (s) => (s.answers.neck_spot === "radiating" ? "neck pain spreading to the arm" : "neck pain"),
  },

  // ------------------------------------------------------------------------------------------- hip
  hip: {
    label: "hip",
    path: ["Lower limb", "Hip"],
    limb: true,
    spot: () => ({ text: "Where around the hip is it?", options: [opt("Groin, at the front", "groin"), opt("Outer side of the hip", "outer"), opt("Buttock", "buttock")] }),
    redFlags: () => ({
      text: "Do any of these apply?",
      options: [opt("After a fall, and can't walk or put weight on it", "fall"), opt("The leg looks shorter or turned outwards", "deformity"), opt("Fever, or too painful to move at all", "septic"), opt("Numbness between the legs, or new bladder or bowel problems", "saddle"), opt("The thigh or calf is swollen", "clot"), NONE],
    }),
    screen: (s, _f, e, u) => {
      if (has(s, "hip_redflags", "saddle")) e.push("Numbness between the legs or new bladder or bowel problems — the nerves at the base of the spine may be compressed");
      if (has(s, "hip_redflags", "fall") || has(s, "hip_redflags", "deformity")) u.push("Can't walk or bear weight after a fall — a broken hip needs ruling out");
      if (has(s, "hip_redflags", "septic")) u.push("A very painful hip with fever — a joint infection needs ruling out");
      if (has(s, "hip_redflags", "clot")) u.push("A swollen thigh or calf — a blood clot needs ruling out");
    },
    pattern: (s) => {
      const spot = s.answers.hip_spot;
      if (spot === "groin" && !asked(s, "hip_socks")) return q("hip_socks", "Is it hard to put on socks, or to get in and out of a car?", "yesno", yesNo);
      if (spot === "outer" && !asked(s, "hip_lying")) return q("hip_lying", "Is it painful to lie on that side at night?", "yesno", yesNo);
      if (spot === "buttock" && !asked(s, "hip_down_leg")) return q("hip_down_leg", "Does the pain go down the back of the leg?", "yesno", yesNo);
      return null;
    },
    possibilities: (s, f) => {
      switch (s.answers.hip_spot) {
        case "groin":
          return s.answers.hip_socks === "yes" ? [`wear in the hip joint (osteoarthritis)${(f.age ?? 0) >= 50 ? ", common after 50" : ""}`, "in younger, active people, a problem with the cartilage rim of the hip (labral tear)"] : ["a groin muscle strain", "a hernia, if there's a lump that comes and goes"];
        case "outer":
          return ["irritation of the tendons and fluid sac on the outer hip (greater trochanteric pain syndrome)", "pain referred from the lower back"];
        case "buttock":
          return s.answers.hip_down_leg === "yes" ? ["irritation of the sciatic nerve from the lower back (sciatica)"] : ["a strain of the buttock muscles", "irritation of the joint between the spine and pelvis"];
      }
      return [];
    },
    selfCare: () => ["Stay active with gentle walking, and avoid sitting for long periods", "Avoid lying on the painful side; a pillow between your knees can help", "A cold or warm pack, whichever feels better, for 15 minutes"],
    watchFor: () => ["You can't walk or put weight on the leg", "Fever, or the hip becomes too painful to move", "Numbness between the legs or new bladder or bowel problems", "A swollen thigh or calf"],
    specialist: (s) => (s.answers.hip_socks === "yes" ? { speciality: ORTHO, reason: "An Orthopaedic doctor commonly evaluates hip joint pain and can arrange an X-ray." } : { speciality: PHYSIO, reason: "A Physiotherapist commonly treats tendon and muscle pain around the hip." }),
    needsReview: (s, f) => (s.answers.hip_socks === "yes" ? "stiffness in the hip joint is worth checking" : (f.age ?? 0) >= 65 ? "hip pain at 65 or older is worth checking" : commonReview(s)),
    phrase: (s) => ({ groin: "groin pain", outer: "outer hip pain", buttock: "buttock pain" } as Record<string, string>)[s.answers.hip_spot ?? ""] ?? "hip pain",
  },

  // ------------------------------------------------------------------------------------------- calf
  calf: {
    label: "calf",
    path: ["Lower limb", "Calf"],
    limb: true,
    spot: () => ({ text: "What's happening in the calf?", options: [opt("Cramps", "cramp"), opt("Pain or tightness", "pain"), opt("Swelling", "swelling"), opt("Pain after a sudden pull or injury", "injury")] }),
    redFlags: () => ({
      text: "These help rule out a blood clot. Do any of them apply?",
      options: [
        opt("Breathless, chest pain or coughing up blood", "pe"),
        opt("Only one leg is swollen", "one_sided"),
        opt("Red, warm or tender to touch", "warm"),
        opt("Long flight or journey, surgery or bed rest recently", "travel"),
        opt("Pregnant, recently gave birth, or taking hormone pills", "hormones"),
        opt("Felt a sudden snap or kick at the back of the leg", "snap"),
        NONE,
      ],
    }),
    screen: (s, _f, e, u) => {
      if (has(s, "calf_redflags", "pe")) e.push("Calf symptoms with breathlessness, chest pain or coughing up blood — a blood clot may have reached the lungs");
      const swollen = s.answers.calf_spot === "swelling" || has(s, "calf_redflags", "one_sided");
      const risk = has(s, "calf_redflags", "travel") || has(s, "calf_redflags", "hormones") || s.answers.calf_travel === "yes";
      if (swollen && (risk || has(s, "calf_redflags", "warm"))) u.push("A swollen calf with risk factors for a clot — a blood clot (DVT) needs ruling out today. Call emergency services if you become breathless or have chest pain");
      else if (has(s, "calf_redflags", "one_sided")) u.push("A swollen calf on one side — a blood clot needs ruling out today");
      if (has(s, "calf_redflags", "snap")) u.push("A snap at the back of the leg — the Achilles tendon or calf muscle may be torn");
    },
    pattern: (s) => {
      const spot = s.answers.calf_spot;
      if (spot === "cramp" && !asked(s, "cramp_when")) return q("cramp_when", "When do the cramps happen?", "chips", [opt("At night", "night"), opt("During or after exercise", "exercise"), opt("Now and then, any time", "random")]);
      if (spot === "pain" && !asked(s, "calf_walking")) return q("calf_walking", "Does it come on when you walk a certain distance, and ease when you stop?", "yesno", yesNo);
      return null;
    },
    possibilities: (s) => {
      switch (s.answers.calf_spot) {
        case "cramp":
          return ["muscle cramps, which are common at night, with exercise, dehydration, pregnancy or some medicines such as water pills", "less commonly, low potassium, calcium or magnesium"];
        case "pain":
          return s.answers.calf_walking === "yes" ? ["reduced blood flow from narrowed leg arteries (claudication), which needs a doctor's check"] : ["a calf muscle strain", "a blood clot, which needs ruling out if the calf is swollen, warm or tender"];
        case "injury":
          return ["a calf muscle strain or tear"];
        case "swelling":
          return ["fluid build-up from standing, heat or medicines such as amlodipine", "a blood clot, which must be ruled out when the swelling is on one side"];
      }
      return [];
    },
    selfCare: (s) =>
      s.answers.calf_spot === "cramp"
        ? ["When a cramp starts, gently pull your toes towards you to stretch the calf", "Drink enough water through the day", "Gentle calf stretches before bed can reduce night cramps", "Ask your doctor whether any of your medicines could be causing cramps"]
        : ["Rest from running or jumping for now, but keep walking gently", "A cold pack wrapped in a cloth for 15 minutes can ease pain", "Raise the leg when sitting"],
    watchFor: () => ["Swelling in one leg, especially if it's warm, red or tender", "Breathlessness, chest pain or coughing up blood — call emergency services", "Pain when walking that eases when you stop"],
    specialist: (s) => (s.answers.calf_walking === "yes" ? { speciality: GP, reason: "A General Physician can check the circulation in your legs and refer you to a vascular specialist if needed." } : s.answers.calf_spot === "injury" ? { speciality: PHYSIO, reason: "A Physiotherapist can guide recovery from a calf strain." } : { speciality: GP, reason: "A General Physician can check for causes such as medicines or low minerals." }),
    needsReview: (s) => (s.answers.calf_walking === "yes" ? "pain on walking that eases with rest can be a circulation problem" : s.answers.calf_spot === "swelling" ? "a swollen calf should be checked" : s.answers.cramp_when === "night" && s.onset === "over_week" ? "frequent cramps can have a treatable cause" : commonReview(s)),
    phrase: (s) => ({ cramp: "calf cramps", swelling: "swollen calf", injury: "calf strain", pain: "calf pain" } as Record<string, string>)[s.answers.calf_spot ?? ""] ?? "calf pain",
  },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];
export const isRegion = (area: string | null | undefined): area is RegionId => !!area && area in REGIONS;
export const REGION_MULTI_KEYS = [...REGION_IDS.map((id) => `${id}_redflags`), "knee_trigger", "burning_context"];

/** Next question for a region: sub-location → side → warning signs → onset → severity → pattern questions → trend. */
export function regionNext(s: GuidedState, f: RegionFacts, shared: { onset: () => QuestionDef; severity: () => QuestionDef; trend: () => QuestionDef }): QuestionDef | null {
  const id = s.bodyArea as RegionId;
  const r = REGIONS[id];
  const spot = r.spot(s);
  if (spot && !asked(s, `${id}_spot`)) return q(`${id}_spot`, spot.text, "body", spot.options);
  if (r.limb && !s.side && !asked(s, "limb_side")) return q("limb_side", `Which side is it on?`, "chips", [opt("Left", "left"), opt("Right", "right"), opt("Both sides", "both")]);
  const rf = r.redFlags(f);
  if (!asked(s, `${id}_redflags`)) return q(`${id}_redflags`, rf.text, "multi", rf.options);
  if (!s.onset) return shared.onset();
  if (!s.severity && s.answers[`${id}_spot`] !== "burning") return shared.severity();
  const p = r.pattern(s, f);
  if (p) return p;
  if (!s.trend && s.onset !== "today" && !asked(s, "pain_trend")) return shared.trend();
  return null;
}

export function regionScreen(s: GuidedState, f: RegionFacts, e: string[], u: string[]) {
  if (isRegion(s.bodyArea)) REGIONS[s.bodyArea].screen(s, f, e, u);
}

export const regionPhrase = (s: GuidedState) => REGIONS[s.bodyArea as RegionId].phrase(s);
export const regionSelfCare = (s: GuidedState) => REGIONS[s.bodyArea as RegionId].selfCare(s);
export const regionWatchFor = (s: GuidedState) => REGIONS[s.bodyArea as RegionId].watchFor(s);

export function regionOutcome(s: GuidedState, f: RegionFacts) {
  const r = REGIONS[s.bodyArea as RegionId];
  return { possibilities: r.possibilities(s, f), selfCare: r.selfCare(s), watchFor: r.watchFor(s), specialist: r.specialist(s, f), review: r.needsReview(s, f), phrase: r.phrase(s) };
}

/** "Lower limb → Foot → Underneath the heel (left)". */
export function regionPath(s: GuidedState): string | null {
  if (!isRegion(s.bodyArea)) return null;
  const r = REGIONS[s.bodyArea];
  const spotOpts = r.spot(s)?.options ?? [];
  const spot = spotOpts.find((o) => o.value === s.answers[`${s.bodyArea}_spot`])?.label;
  const side = s.side ? ` (${s.side})` : s.answers.limb_side === "both" ? " (both sides)" : "";
  return [...r.path, ...(spot ? [spot] : [])].join(" → ") + side;
}

/** Body-part words in free text → region and any sub-location already given. */
export function regionFromText(t: string): { area: RegionId | "arm" | "leg"; answers?: Record<string, string> } | null {
  if (/\bheels?\b/.test(t)) return { area: "ankle_foot", answers: { foot_area: "heel" } };
  if (/\b(feet|foot|soles?|toes?|arch)\b/.test(t) && /\b(burn\w*|numb|tingl\w*)\b/.test(t)) return { area: "ankle_foot", answers: { ankle_foot_spot: "burning" } };
  if (/\b(toes?|ball of (my|the) foot)\b/.test(t)) return { area: "ankle_foot", answers: { ankle_foot_spot: "forefoot" } };
  if (/\bankles?\b/.test(t)) return { area: "ankle_foot", answers: { ankle_foot_spot: "ankle" } };
  if (/\b(foot|feet|soles?|arch)\b/.test(t)) return { area: "ankle_foot" };
  if (/\bknees?\b/.test(t)) return { area: "knee" };
  if (/\bcalf|calves|shin\b/.test(t) || /\bmuscle cramps?\b.*\bleg\b|\bleg\b.*\bmuscle cramps?\b|\bleg cramps?\b/.test(t)) {
    const answers: Record<string, string> = {};
    if (/\bcramp/.test(t)) answers.calf_spot = "cramp";
    else if (/\bswell|swollen/.test(t)) answers.calf_spot = "swelling";
    if (/\b(flight|flew|journey|long drive|travel\w*|surgery|operation|bed ?rest)\b/.test(t)) answers.calf_travel = "yes";
    return { area: "calf", answers };
  }
  if (/\b(hips?|groin|buttocks?)\b/.test(t)) return { area: "hip", answers: /\bgroin\b/.test(t) ? { hip_spot: "groin" } : /\bbuttock/.test(t) ? { hip_spot: "buttock" } : {} };
  if (/\belbows?\b/.test(t)) return { area: "elbow" };
  if (/\b(wrists?|hands?|fingers?|thumbs?|palms?)\b/.test(t)) {
    const answers: Record<string, string> = {};
    if (/\b(numb\w*|tingl\w*|pins and needles)\b/.test(t)) answers.wrist_hand_spot = "numb";
    else if (/\bthumb/.test(t)) answers.wrist_hand_spot = "thumb";
    else if (/\bfingers?\b/.test(t)) answers.wrist_hand_spot = "fingers";
    else if (/\bwrists?\b/.test(t)) answers.wrist_hand_spot = "wrist";
    return { area: "wrist_hand", answers };
  }
  if (/\bshoulder blade/.test(t)) return { area: "shoulder", answers: { shoulder_spot: "back" } };
  if (/\bshoulders?\b/.test(t)) return { area: "shoulder" };
  if (/\bneck\b/.test(t)) return { area: "neck" };
  if (/\b(arms?|forearm)\b/.test(t)) return { area: "arm" };
  if (/\b(legs?|thighs?)\b/.test(t)) return { area: "leg" };
  return null;
}
