import { beforeAll, describe, expect, it } from "vitest";
import { applyAnswer, decide, nextQuestion, outcome, screen, type PatientFacts } from "@/lib/ai/guided/symptom-engine";
import { detectSymptomStart, parseLipids, seedFromStart } from "@/lib/ai/guided/detect";
import { emptyState, type GuidedState } from "@/lib/ai/guided/types";
import { createConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import type { ChatCard, QuestionCard } from "@/lib/ai/types";
import { createWorld, type TestWorld } from "./helpers";

const adult: PatientFacts = { name: "Neerja", isSelf: true, age: 38, sex: "female", pregnant: false, conditions: [] };
const man: PatientFacts = { ...adult, name: "Dad", isSelf: false, age: 68, sex: "male" };
const start = (complaint?: string) => (complaint ? applyAnswer(emptyState("symptom", "p"), { key: "symptom_category", value: complaint }) : emptyState("symptom", "p"));
const ans = (s: GuidedState, ...pairs: [string, string][]) => pairs.reduce((acc, [key, value]) => applyAnswer(acc, { key, value }), s);

describe("heart module", () => {
  it("routes chest pain to the chest red-flag screen first", () => {
    const s = ans(start("heart"), ["heart_symptom", "chest"]);
    expect(nextQuestion(s, adult)!.key).toBe("chest_redflags");
  });
  it("treats palpitations with fainting or chest pain as an emergency", () => {
    expect(screen(ans(start("heart"), ["heart_symptom", "palpitations"], ["palp_redflags", "faint"]), adult)?.level).toBe("emergency");
    expect(screen(ans(start("heart"), ["heart_symptom", "palpitations"], ["palp_redflags", "chest_pain"]), adult)?.level).toBe("emergency");
  });
  it("recommends an ECG check for recurring palpitations, a Cardiologist when they happen most days", () => {
    let s = ans(start("heart"), ["heart_symptom", "palpitations"], ["palp_redflags", "none"], ["palp_pattern", "recurrent"], ["palp_trigger", "caffeine"]);
    const o = outcome(s, adult);
    expect(o.speciality).toBe("General Physician");
    expect(o.headline).toMatch(/ECG/);
    s = ans(s, ["palp_pattern", "daily"]);
    expect(outcome(s, adult).speciality).toBe("Cardiologist");
  });
  it("flags breathlessness lying flat with swollen ankles for same-day care", () => {
    expect(screen(ans(start("heart"), ["heart_symptom", "breathless"], ["breathless_signs", "orthopnoea|oedema"]), man)?.level).toBe("urgent");
  });
});

describe("eye module", () => {
  it("treats chemicals and injuries as emergencies, with rinse advice", () => {
    const f = screen(ans(start("eye"), ["eye_redflags", "chemical"]), adult);
    expect(f?.level).toBe("emergency");
    expect(f?.reasons.join(" ")).toMatch(/rinse with clean running water/);
  });
  it("gets contact-lens wearers with a painful red eye seen the same day", () => {
    const s = ans(start("eye"), ["eye_redflags", "none"], ["eye_which", "one"], ["eye_symptoms", "red|photophobia|lenses"]);
    expect(screen(s, adult)?.level).toBe("urgent");
  });
  it("lets itchy, watery eyes be monitored at home", () => {
    const s = ans(start("eye"), ["eye_redflags", "none"], ["eye_which", "both"], ["eye_symptoms", "itch"], ["onset", "today"]);
    const d = decide(s, adult);
    expect(d.kind === "complete" && d.outcome.level).toBe("self_care");
  });
});

describe("hair, hormones, joints, aches", () => {
  it("doesn't push supplements and lets post-baby shedding be monitored", () => {
    const s = ans(start("hair"), ["hair_pattern", "diffuse"], ["hair_duration", "few_weeks"], ["hair_context", "postpartum"]);
    const d = decide(s, adult);
    expect(d.kind).toBe("complete");
    if (d.kind === "complete") {
      expect(d.outcome.level).toBe("self_care");
      expect(d.outcome.selfCare.join(" ")).toMatch(/Don't start supplements/);
    }
  });
  it("sends patchy hair loss to a Dermatologist", () => {
    const s = ans(start("hair"), ["hair_pattern", "patchy"], ["hair_duration", "1_6_months"], ["hair_context", "none"]);
    expect(outcome(s, adult).speciality).toBe("Dermatologist");
  });
  it("treats very heavy bleeding with fainting as an emergency, and periods go to a Gynaecologist", () => {
    expect(screen(ans(start("hormones"), ["hormone_concern", "periods"], ["period_redflags", "heavy|faint"]), adult)?.level).toBe("emergency");
    const s = ans(start("hormones"), ["hormone_concern", "periods"], ["period_redflags", "none"], ["pregnancy_possible", "no"], ["hormone_signs", "mood"], ["onset", "1_6_months"]);
    expect(outcome(s, adult).speciality).toBe("Gynaecologist");
  });
  it("asks about pregnancy before interpreting period changes", () => {
    const s = ans(start("hormones"), ["hormone_concern", "periods"], ["period_redflags", "none"]);
    expect(nextQuestion(s, adult)!.key).toBe("pregnancy_possible");
  });
  it("treats a hot, swollen joint with fever as same-day care", () => {
    const s = ans(start("pain"), ["pain_location", "joint"], ["onset", "today"], ["severity", "moderate"], ["pain_character", "dull"], ["limb_associated", "red_hot|swelling|fever"]);
    expect(screen(s, adult)?.level).toBe("urgent");
  });
  it("flags severe muscle pain with dark urine", () => {
    expect(screen(ans(start("weakness"), ["weakness_onset", "aches"], ["aches_associated", "dark_urine"]), adult)?.level).toBe("urgent");
  });
  it("asks children's breathing questions in the cough flow and escalates ribs pulling in", () => {
    const child: PatientFacts = { ...adult, name: "the child", isSelf: false, age: 4 };
    const s = ans(start("cough"), ["cough_duration", "under_week"], ["cough_type", "dry"], ["cough_associated", "fever"]);
    expect(nextQuestion(s, child)!.key).toBe("child_breathing");
    expect(screen(ans(s, ["child_breathing", "ribs"]), child)?.level).toBe("emergency");
  });
  it("escalates a severe headache in pregnancy, and new confusion in an older adult", () => {
    const s = ans(start("headache"), ["headache_duration", "hours"], ["headache_severity", "severe"], ["headache_sudden", "no"], ["headache_associated", "pregnant"]);
    expect(screen(s, adult)?.level).toBe("urgent");
    const w = ans(start("weakness"), ["weakness_onset", "gradual"], ["weakness_duration", "under_week"], ["weakness_associated", "confused"]);
    expect(screen(w, man)?.level).toBe("urgent");
  });
});

describe("free-text detection", () => {
  it("recognises the new modules", () => {
    expect(detectSymptomStart("My heart is racing", [])).toMatchObject({ complaint: "heart", symptomType: "palpitations" });
    expect(detectSymptomStart("Why is my hair falling? Hair fall is bad", [])).toMatchObject({ complaint: "hair" });
    expect(detectSymptomStart("My periods are irregular", [])).toMatchObject({ complaint: "hormones", symptomType: "periods" });
    expect(detectSymptomStart("My eye is red and itchy", [])).toMatchObject({ complaint: "eye" });
    const seeded = seedFromStart(emptyState("symptom", "p"), detectSymptomStart("My heart is racing", [])!);
    expect(nextQuestion(seeded, adult)!.key).toBe("palp_redflags");
  });
  it("reads lipid values", () => {
    expect(parseLipids("My LDL is 172. What should I do?")).toMatchObject({ ldl: 172, mmol: false });
    expect(parseLipids("HDL 38, triglycerides 210 mg/dL")).toMatchObject({ hdl: 38, tg: 210 });
    expect(parseLipids("My cholesterol is high")).toBeNull();
  });
});

describe("cholesterol in context", () => {
  let w: TestWorld;
  beforeAll(async () => {
    delete process.env.ENABLE_DOCTOR_PORTAL;
    w = await createWorld();
  });
  const question = (cards: ChatCard[]) => cards.find((c): c is QuestionCard => c.type === "question");

  it("'My LDL is 172' asks for the other numbers and risk factors, then explains without prescribing", async () => {
    const conv = await createConversation(w.demo, w.profiles.dad);
    let m = (await handleUserMessage(w.demo, conv, "My LDL is 172. What should I do?")).assistantMessage;
    expect(question(m.cards)?.key).toBe("hdl_value");
    expect(question(m.cards)?.options.map((o) => o.value)).toContain("skip");
    for (const key of ["hdl_value", "tg_value", "total_value"]) m = (await handleUserMessage(w.demo, conv, "I don't have this", { answer: { key, value: "skip" } })).assistantMessage;
    expect(question(m.cards)?.key).toBe("lipid_risks");
    m = (await handleUserMessage(w.demo, conv, "High blood pressure, Smoking", { answer: { key: "lipid_risks", value: "bp|smoking" } })).assistantMessage;
    expect(m.content).toMatch(/LDL is outside the usual target/);
    expect(m.content).toMatch(/heart-risk factors/);
    const info = m.cards.find((c) => c.type === "info" && c.title === "What you can do");
    expect(info && info.type === "info" && info.body).toMatch(/Don't start or stop cholesterol medicine/);
    expect(m.cards.find((c) => c.type === "doctor_recommendation")).toMatchObject({ speciality: "General Physician" });
    expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "clinician" });
  });
});
