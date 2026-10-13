import { beforeAll, describe, expect, it } from "vitest";
import { englishReading } from "@/lib/clinical/lexicon";
import { applyAnswer, decide, nextQuestion, screen, type PatientFacts } from "@/lib/ai/guided/symptom-engine";
import { detectSymptomStart } from "@/lib/ai/guided/detect";
import { babyFactsFromText } from "@/lib/ai/guided/agent";
import { emptyState, type GuidedState } from "@/lib/ai/guided/types";
import { createConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import type { ChatCard, QuestionCard } from "@/lib/ai/types";
import { createWorld, type TestWorld } from "./helpers";

const adult: PatientFacts = { name: "Neerja", isSelf: true, age: 38, sex: "female", pregnant: false, conditions: [] };
const start = (complaint: string, area?: string) => {
  let s = applyAnswer(emptyState("symptom", "p"), { key: "symptom_category", value: complaint });
  if (area) s = applyAnswer(s, { key: "pain_location", value: area });
  return s;
};
const ans = (s: GuidedState, ...pairs: [string, string][]) => pairs.reduce((acc, [key, value]) => applyAnswer(acc, { key, value }), s);

describe("everyday language: Hindi, Punjabi, Hinglish and misspellings", () => {
  it("reads common phrases in English, keeping negation", () => {
    expect(englishReading("Seene mein bhaaripan hai aur pasina aa raha hai")).toMatch(/heaviness in chest.*sweating/);
    expect(englishReading("Mera ghutna dukh raha hai")).toMatch(/knee pain/);
    expect(englishReading("Kamar mein dard hai")).toMatch(/lower back.*pain/);
    expect(englishReading("bukhar nahi hai")).toMatch(/no fever/);
    expect(englishReading("Mera mann nahi lag raha")).toMatch(/low mood/);
    expect(englishReading("I have a bad headake and feaver")).toMatch(/headache and fever/);
  });
  it("doesn't mistranslate ordinary English", () => {
    expect(englishReading("It's a sunny day, thanks sir")).toBeNull();
    expect(englishReading("Can I give my pet a treat?")).toBeNull();
  });
  it("starts the right check from Hinglish", () => {
    expect(detectSymptomStart("Mera ghutna dukh raha hai", [])).toMatchObject({ complaint: "pain", bodyArea: "knee" });
    expect(detectSymptomStart("Meri edhi mein dard hai", [])).toMatchObject({ bodyArea: "ankle_foot", answers: { foot_area: "heel" } });
    expect(detectSymptomStart("Haath sunn ho raha hai", [])).toMatchObject({ bodyArea: "wrist_hand", answers: { wrist_hand_spot: "numb" } });
    expect(detectSymptomStart("Pair mein nas chadh gayi", [])).toMatchObject({ bodyArea: "calf", answers: { calf_spot: "cramp" } });
    expect(detectSymptomStart("Pet mein jalan ho rahi hai", [])).toMatchObject({ complaint: "stomach", symptomType: "acidity" });
    expect(detectSymptomStart("Mera mann nahi lag raha", [])).toMatchObject({ complaint: "mood" });
  });
  it("understands vague everyday descriptions", () => {
    expect(detectSymptomStart("My knee makes noise", [])).toMatchObject({ bodyArea: "knee" });
    expect(detectSymptomStart("My foot feels like it's burning", [])).toMatchObject({ bodyArea: "ankle_foot", answers: { ankle_foot_spot: "burning" } });
    expect(detectSymptomStart("My hands go numb while sleeping", [])).toMatchObject({ bodyArea: "wrist_hand", answers: { wrist_hand_spot: "numb" } });
    expect(detectSymptomStart("My entire body hurts", [])).toMatchObject({ complaint: "weakness", answers: { weakness_onset: "aches" } });
    expect(detectSymptomStart("I don't feel mentally well", [])).toMatchObject({ complaint: "mood" });
    expect(detectSymptomStart("I feel sad for no reason", [])).toMatchObject({ complaint: "mood" });
  });
  it("reads a baby's age and temperature from text", () => {
    expect(babyFactsFromText("My baby is two months old and has a temperature of 38.2°C")).toEqual({ ageMonths: 2, temp: "38_39" });
    expect(babyFactsFromText("my 6-week-old has a fever of 101 F").temp).toBe("38_39");
  });
});

describe("head-to-toe anatomy", () => {
  it("offers the main body regions when someone just says 'pain'", () => {
    const q = nextQuestion(start("pain"), adult)!;
    expect(q.key).toBe("pain_location");
    expect(q.options.map((o) => o.value)).toEqual(expect.arrayContaining(["head", "neck", "arm", "wrist_hand", "leg", "knee", "ankle_foot", "back"]));
  });
  it("accepts body-map taps with side, area and sub-location", () => {
    const knee = ans(start("pain"), ["pain_location", "left:knee:back"]);
    expect(knee).toMatchObject({ side: "left", bodyArea: "knee", answers: { knee_spot: "back" } });
    expect(nextQuestion(knee, adult)!.key).toBe("knee_redflags");
    const heel = ans(start("pain"), ["pain_location", "right:ankle_foot:heel"]);
    expect(nextQuestion(heel, adult)!.text).toMatch(/underneath your heel/);
    expect(ans(start("pain"), ["pain_location", "neck:back"])).toMatchObject({ bodyArea: "neck", answers: { neck_spot: "back" } });
    expect(ans(start("pain"), ["pain_location", "left:chest"])).toMatchObject({ side: "left", bodyArea: "chest" });
  });
  it("narrows an arm or leg to the exact part", () => {
    expect(nextQuestion(start("pain", "arm"), adult)!.key).toBe("arm_part");
    expect(nextQuestion(ans(start("pain", "leg"), ["leg_part", "knee"]), adult)!.key).toBe("knee_spot");
  });
  it("knee: front → side → warning signs → onset → severity → what makes it worse", () => {
    let s = start("pain", "knee");
    expect(nextQuestion(s, adult)!.text).toMatch(/front, back, inner side or outer side/);
    s = ans(s, ["knee_spot", "front"]);
    expect(nextQuestion(s, adult)!.key).toBe("limb_side");
    s = ans(s, ["limb_side", "left"], ["knee_redflags", "none"], ["onset", "4_7_days"], ["severity", "mild"]);
    expect(nextQuestion(s, adult)!.text).toMatch(/climbing stairs, squatting or walking/);
    s = ans(s, ["knee_trigger", "stairs|squat"], ["pain_trend", "same"]);
    const d = decide(s, adult);
    expect(d.kind).toBe("complete");
    if (d.kind === "complete") {
      expect(d.outcome.level).toBe("self_care");
      expect(d.outcome.possibilities!.join(" ")).toMatch(/patellofemoral/);
      expect(d.outcome.summary).toContain("Location: Lower limb → Knee → Front or kneecap (left)");
    }
  });
  it("heel: underneath + worst first thing → plantar fascia among several possibilities", () => {
    const s = ans(start("pain", "ankle_foot"), ["ankle_foot_spot", "heel_under"], ["limb_side", "right"], ["ankle_foot_redflags", "none"], ["onset", "over_week"], ["severity", "moderate"], ["heel_morning", "yes"], ["heel_start", "gradual"], ["pain_trend", "same"]);
    const d = decide(s, adult);
    expect(d.kind === "complete" && d.outcome.possibilities!.length).toBeGreaterThan(1);
    expect(d.kind === "complete" && d.outcome.possibilities![0]).toMatch(/plantar fasciopathy/);
    expect(d.kind === "complete" && d.outcome.speciality).toBe("Physiotherapist");
  });
  it("with diabetes, heel pain goes to a General Physician first", () => {
    const s = ans(start("pain", "ankle_foot"), ["ankle_foot_spot", "heel_under"], ["limb_side", "right"], ["ankle_foot_redflags", "none"], ["onset", "over_week"], ["severity", "moderate"], ["heel_morning", "yes"], ["heel_start", "gradual"], ["pain_trend", "same"]);
    const d = decide(s, { ...adult, conditions: ["Type 2 diabetes"] });
    expect(d.kind === "complete" && d.outcome.speciality).toBe("General Physician");
    expect(d.kind === "complete" && d.outcome.headline).toMatch(/more than a week/);
  });
  it("elbow: outer side, worse gripping → tennis elbow is one possibility", () => {
    let s = ans(start("pain", "arm"), ["arm_part", "elbow"]);
    expect(nextQuestion(s, adult)!.text).toMatch(/inner side, outer side, front or back/);
    s = ans(s, ["elbow_spot", "outer"], ["limb_side", "right"], ["elbow_redflags", "none"], ["onset", "1_3_days"]);
    s = ans(s, ["severity", "mild"]);
    expect(nextQuestion(s, adult)!.text).toMatch(/grip something, lift objects or twist your wrist/);
    const d = decide(ans(s, ["elbow_grip", "yes"], ["pain_trend", "better"]), adult);
    expect(d.kind === "complete" && d.outcome.possibilities![0]).toMatch(/tennis elbow/);
  });
  it("numb fingers at night point to carpal tunnel, and an Orthopaedic doctor", () => {
    const s = ans(start("pain", "wrist_hand"), ["wrist_hand_spot", "numb"], ["limb_side", "right"], ["wrist_hand_redflags", "none"], ["onset", "over_week"], ["severity", "mild"], ["hand_fingers", "median"], ["hand_night", "yes"], ["pain_trend", "same"]);
    const d = decide(s, adult);
    expect(d.kind === "complete" && d.outcome.possibilities![0]).toMatch(/carpal tunnel/);
    expect(d.kind === "complete" && d.outcome.speciality).toBe("Orthopaedic Doctor");
  });
  it("doesn't over-refer a short, mild overuse ache because of a chronic condition", () => {
    const s = ans(start("pain", "knee"), ["knee_spot", "front"], ["limb_side", "left"], ["knee_redflags", "none"], ["onset", "1_3_days"], ["severity", "mild"], ["knee_trigger", "stairs"], ["pain_trend", "same"]);
    const d = decide(s, { ...adult, conditions: ["Type 2 diabetes"] });
    expect(d.kind === "complete" && d.outcome.level).toBe("self_care");
  });
});

describe("warning signs across body systems", () => {
  it("knee, foot, hand, shoulder, neck and hip red flags", () => {
    expect(screen(ans(start("pain", "knee"), ["knee_spot", "whole"], ["limb_side", "left"], ["knee_redflags", "hot|fever"]), adult)?.reasons.join()).toMatch(/joint infection/);
    expect(screen(ans(start("pain", "ankle_foot"), ["ankle_foot_spot", "ankle"], ["limb_side", "left"], ["ankle_foot_redflags", "cold_foot"]), adult)?.level).toBe("emergency");
    expect(screen(ans(start("pain", "wrist_hand"), ["wrist_hand_spot", "wrist"], ["limb_side", "left"], ["wrist_hand_redflags", "weakness"]), adult)?.level).toBe("emergency");
    expect(screen(ans(start("pain", "arm"), ["arm_part", "shoulder"], ["shoulder_spot", "front"], ["limb_side", "left"], ["shoulder_redflags", "cardiac"]), adult)?.level).toBe("emergency");
    expect(screen(ans(start("pain", "neck"), ["neck_spot", "back"], ["neck_redflags", "meningitis"]), adult)?.level).toBe("emergency");
    expect(screen(ans(start("pain", "leg"), ["leg_part", "hip"], ["hip_spot", "buttock"], ["limb_side", "left"], ["hip_redflags", "saddle"]), adult)?.level).toBe("emergency");
  });
  it("one-sided calf swelling after travel needs same-day assessment; with breathlessness it's an emergency", () => {
    const s = ans(start("pain", "leg"), ["leg_part", "calf"], ["calf_spot", "swelling"], ["limb_side", "left"]);
    expect(screen(ans(s, ["calf_redflags", "one_sided|travel"]), adult)).toMatchObject({ level: "urgent", reasons: [expect.stringMatching(/blood clot/)] });
    expect(screen(ans(s, ["calf_redflags", "pe"]), adult)?.level).toBe("emergency");
  });
  it("possible ectopic pregnancy is an emergency", () => {
    const s = ans(start("pain", "lower_abdomen"), ["onset", "today"], ["severity", "moderate"], ["pain_character", "sharp"], ["abdomen_associated", "pregnant|faint"]);
    expect(screen(s, adult)).toMatchObject({ level: "emergency", reasons: [expect.stringMatching(/ectopic/)] });
  });
  it("sepsis and severe dehydration signs escalate", () => {
    const fever = ans(start("fever"), ["fever_temp", "high"], ["fever_duration", "1_2_days"]);
    expect(screen(ans(fever, ["fever_redflags", "mottled"]), adult)?.level).toBe("emergency");
    expect(screen(ans(fever, ["fever_redflags", "fast|no_urine"]), adult)?.reasons.join()).toMatch(/sepsis/);
    expect(screen(ans(fever, ["fever_redflags", "fast"]), adult)?.level).toBe("urgent");
    const gi = ans(start("stomach"), ["stomach_type", "diarrhoea"], ["gi_duration", "1_2_days"], ["gi_redflags", "severe_dehydration"]);
    expect(screen(gi, adult)?.level).toBe("emergency");
  });
});

describe("conversations (the spec's safety test cases)", () => {
  let w: TestWorld;
  beforeAll(async () => {
    delete process.env.ENABLE_DOCTOR_PORTAL;
    w = await createWorld();
  });
  const question = (cards: ChatCard[]) => cards.find((c): c is QuestionCard => c.type === "question");
  const say = async (text: string, answer?: { key: string; value: string }, conv?: string) => {
    const id = conv ?? (await createConversation(w.demo, w.profiles.me));
    return { conv: id, m: (await handleUserMessage(w.demo, id, text, answer ? { answer } : {})).assistantMessage };
  };

  it("'I have chest pressure and I'm sweating' escalates instead of asking pain questions", async () => {
    const { m } = await say("I have chest pressure and I'm sweating.");
    expect(m.cards.some((c) => c.type === "emergency")).toBe(true);
    expect(question(m.cards)).toBeUndefined();
  });
  it("the same in Hinglish escalates too", async () => {
    const { m } = await say("Seene mein bhaaripan hai aur pasina aa raha hai");
    expect(m.cards.some((c) => c.type === "emergency")).toBe(true);
  });
  it("'My heel hurts in the morning' gets targeted heel questions, without a diagnosis", async () => {
    const { m } = await say("My heel hurts in the morning.");
    expect(question(m.cards)?.key).toBe("ankle_foot_spot");
    expect(m.content).toMatch(/underneath your heel, behind it or around its sides/);
    expect(m.content).not.toMatch(/plantar|fasciitis/i);
  });
  it("'I feel low and don't want to live anymore' gets the crisis response straight away", async () => {
    const { m } = await say("I feel low and don't want to live anymore.");
    const card = m.cards.find((c) => c.type === "emergency");
    expect(card && card.type === "emergency" && card.crisisLine).toBeTruthy();
    expect(m.content).toMatch(/You don't have to handle this alone/);
  });
  it("Hindi crisis wording is recognised", async () => {
    const { m } = await say("Mujhe ab jeena nahi hai");
    expect(m.cards.some((c) => c.type === "emergency" && !!c.crisisLine)).toBe(true);
  });
  it("'My baby is two months old and has a temperature of 38.2°C' gets prompt medical assessment", async () => {
    const { m } = await say("My baby is two months old and has a temperature of 38.2°C.");
    expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "same_day" });
    expect(m.content).toMatch(/under 3 months/);
  });
  it("'My calf is swollen after a long flight' screens for a clot and arranges same-day assessment", async () => {
    const { m } = await say("My calf is swollen after a long flight.");
    expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "same_day" });
    const card = m.cards.find((c) => c.type === "emergency");
    expect(card && card.type === "emergency" && card.reasons.join()).toMatch(/blood clot/);
  });
  it("a Hinglish knee complaint asks where on the knee", async () => {
    const { m } = await say("Mera ghutna dukh raha hai");
    expect(question(m.cards)?.key).toBe("knee_spot");
  });

  describe("mental health", () => {
    it("asks gently, screens safety, and suggests talking therapy when it's affecting life", async () => {
      const first = await say("I feel low");
      const conv = first.conv;
      let m = first.m;
      expect(question(m.cards)?.key).toBe("mood_duration");
      ({ m } = await say("About two weeks", { key: "mood_duration", value: "two_weeks" }, conv));
      expect(question(m.cards)?.key).toBe("mood_safety");
      expect(m.content).toMatch(/thoughts of not wanting to be alive/);
      ({ m } = await say("No", { key: "mood_safety", value: "no" }, conv));
      expect(question(m.cards)?.options.map((o) => o.value)).toEqual(expect.arrayContaining(["sleep", "appetite", "energy", "interest"]));
      ({ m } = await say("Sleep, Energy, Interest", { key: "mood_signs", value: "sleep|energy|interest" }, conv));
      ({ m } = await say("Hard to keep up", { key: "mood_impact", value: "struggling" }, conv));
      expect(m.cards.find((c) => c.type === "doctor_recommendation")).toMatchObject({ speciality: "Clinical Psychologist" });
      const why = m.cards.find((c) => c.type === "info" && c.title === "What this could be");
      expect(why && why.type === "info" && why.body).toMatch(/depression.*common and treatable/i);
      expect(why && why.type === "info" && why.body).toMatch(/isn't a diagnosis/);
    });
    it("'I might act on them' goes straight to the crisis response", async () => {
      const { conv } = await say("I feel low");
      await say("A few days", { key: "mood_duration", value: "days" }, conv);
      const { m } = await say("Yes, and I might act on them", { key: "mood_safety", value: "active" }, conv);
      expect(m.cards.some((c) => c.type === "emergency" && !!c.crisisLine)).toBe(true);
    });
    it("'safe right now' continues the check but always shows the crisis line", async () => {
      const { conv } = await say("I've been really anxious");
      await say("A month or more", { key: "mood_duration", value: "month_plus" }, conv);
      await say("Sometimes, but I'm safe", { key: "mood_safety", value: "passive" }, conv);
      await say("Panic", { key: "mood_signs", value: "panic|racing" }, conv);
      const { m } = await say("Managing", { key: "mood_impact", value: "managing" }, conv);
      const support = m.cards.find((c) => c.type === "info" && c.title === "Support is there any time");
      expect(support && support.type === "info" && support.body).toMatch(/14416/);
      expect(m.cards.find((c) => c.type === "doctor_recommendation")).toMatchObject({ speciality: "Psychiatrist" });
    });
  });
});
