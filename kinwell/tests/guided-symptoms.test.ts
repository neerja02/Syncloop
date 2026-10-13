import { describe, expect, it } from "vitest";
import { applyAnswer, decide, matchTypedAnswer, nextQuestion, outcome, screen, type PatientFacts } from "@/lib/ai/guided/symptom-engine";
import { detectSymptomStart, seedFromStart } from "@/lib/ai/guided/detect";
import { emptyState, type GuidedState } from "@/lib/ai/guided/types";
import { VALUE_TESTS } from "@/lib/ai/guided/test-ranges";

const adult: PatientFacts = { name: "Neerja", isSelf: true, age: 38, sex: "female", pregnant: false, conditions: [] };
const start = () => emptyState("symptom", "p1");
const answer = (s: GuidedState, key: string, value: string) => applyAnswer(s, { key, value });

describe("adaptive symptom engine", () => {
  it("starts by asking what the person is experiencing, with tappable categories", () => {
    const q = nextQuestion(start(), adult)!;
    expect(q.key).toBe("symptom_category");
    expect(q.options.map((o) => o.label)).toEqual(expect.arrayContaining(["Pain", "Chest or heart", "Fever", "Cough or cold", "Breathing problem", "Stomach problem", "Headache", "Skin problem", "Eye problem", "Tiredness or body aches", "Hair loss", "Hormones or periods", "Something else"]));
  });

  it("asks where the pain is, then runs chest red-flag screening immediately for chest pain", () => {
    let s = answer(start(), "symptom_category", "pain");
    expect(nextQuestion(s, adult)!.key).toBe("pain_location");
    s = answer(s, "pain_location", "left:chest");
    expect(s.side).toBe("left");
    expect(s.bodyArea).toBe("chest");
    const q = nextQuestion(s, adult)!;
    expect(q.key).toBe("chest_redflags");
    expect(q.style).toBe("multi");
  });

  it("stops the normal flow with an emergency when concerning chest symptoms are chosen", () => {
    let s = answer(answer(start(), "symptom_category", "pain"), "pain_location", "left:chest");
    s = answer(s, "chest_redflags", "sweating|spreading");
    const d = decide(s, adult);
    expect(d.kind).toBe("escalate");
    if (d.kind === "escalate") {
      expect(d.level).toBe("emergency");
      expect(d.reasons.join(" ")).toMatch(/sweating/i);
    }
  });

  it("continues adaptive questioning for non-urgent pain and recommends a General Physician after a few days", () => {
    let s = answer(start(), "symptom_category", "pain");
    s = answer(s, "pain_location", "upper_abdomen");
    expect(nextQuestion(s, adult)!.key).toBe("onset");
    s = answer(s, "onset", "1_3_days");
    expect(nextQuestion(s, adult)!.key).toBe("severity");
    s = answer(s, "severity", "moderate");
    expect(nextQuestion(s, adult)!.key).toBe("pain_character");
    s = answer(s, "pain_character", "dull");
    expect(nextQuestion(s, adult)!.key).toBe("abdomen_associated");
    s = answer(s, "abdomen_associated", "none");
    expect(nextQuestion(s, adult)!.key).toBe("pain_trend");
    s = answer(s, "pain_trend", "same");
    const d = decide(s, adult);
    expect(d.kind).toBe("complete");
    if (d.kind === "complete") {
      expect(d.outcome.speciality).toBe("General Physician");
      expect(d.outcome.headline).toMatch(/doesn't appear to show the emergency signs I checked for/);
      expect(d.outcome.headline).not.toMatch(/diagnos/i);
    }
  });

  it("never asks a question whose answer is already known (duration from free text)", () => {
    const s = seedFromStart(start(), { complaint: "pain", bodyArea: "back" });
    expect(nextQuestion(s, adult)!.key).toBe("onset");
    const s2 = answer(s, "onset", "today");
    expect(s2.asked).toContain("onset");
    expect(nextQuestion(s2, adult)!.key).toBe("severity");
  });

  it("suggests a Gastroenterologist for persistent upper-abdominal pain, phrased as who to see, not a diagnosis", () => {
    let s = answer(answer(start(), "symptom_category", "pain"), "pain_location", "upper_abdomen");
    for (const [k, v] of [["onset", "over_week"], ["severity", "moderate"], ["pain_character", "burning"], ["abdomen_associated", "none"], ["pain_trend", "same"]] as const) s = answer(s, k, v);
    const o = outcome(s, adult);
    expect(o.speciality).toBe("Gastroenterologist");
    expect(o.reason).toMatch(/commonly evaluates/);
  });

  it("sends children to a Paediatrician first", () => {
    let s = answer(start(), "symptom_category", "cough");
    for (const [k, v] of [["cough_duration", "over_3_weeks"], ["cough_type", "dry"], ["cough_associated", "none"]] as const) s = answer(s, k, v);
    expect(outcome(s, { ...adult, age: 6, isSelf: false, name: "Aarav" }).speciality).toBe("Paediatrician");
  });

  it("treats a sudden, extremely severe headache as an emergency", () => {
    let s = answer(start(), "symptom_category", "headache");
    expect(nextQuestion(s, adult)!.key).toBe("headache_duration");
    s = answer(s, "headache_duration", "under_hour");
    s = answer(s, "headache_severity", "severe");
    expect(nextQuestion(s, adult)!.key).toBe("headache_sudden");
    s = answer(s, "headache_sudden", "yes");
    expect(screen(s, adult)?.level).toBe("emergency");
  });

  it("flags stroke-like weakness and severe allergic skin reactions", () => {
    expect(screen(answer(answer(start(), "symptom_category", "weakness"), "weakness_onset", "one_side"), adult)?.level).toBe("emergency");
    expect(screen(answer(answer(answer(start(), "symptom_category", "skin"), "skin_type", "rash"), "skin_redflags", "face_swelling"), adult)?.level).toBe("emergency");
  });

  it("marks blood in vomit or stool as urgent (be seen today), not routine", () => {
    let s = answer(answer(start(), "symptom_category", "stomach"), "stomach_type", "vomiting");
    s = answer(answer(s, "gi_duration", "today"), "gi_redflags", "blood");
    expect(screen(s, adult)?.level).toBe("urgent");
  });

  it("offers pregnancy-related options only where relevant", () => {
    const s = answer(answer(start(), "symptom_category", "pain"), "pain_location", "lower_abdomen");
    const filled = ["onset", "severity", "pain_character"].reduce((acc, k) => answer(acc, k, k === "onset" ? "today" : k === "severity" ? "mild" : "cramping"), s);
    const male = nextQuestion(filled, { ...adult, sex: "male" })!;
    const female = nextQuestion(filled, { ...adult, sex: "female", age: 30 })!;
    expect(male.options.some((o) => o.value === "pregnant")).toBe(false);
    expect(female.options.some((o) => o.value === "pregnant")).toBe(true);
  });

  it("maps typed answers onto options", () => {
    const sev = nextQuestion(answer(answer(answer(start(), "symptom_category", "pain"), "pain_location", "back"), "onset", "today"), adult)!;
    expect(matchTypedAnswer(sev, "about a 5")?.value).toBe("moderate");
    expect(matchTypedAnswer({ style: "yesno", options: [] }, "yes it did")?.value).toBe("yes");
    expect(matchTypedAnswer({ style: "multi", options: [] }, "none")?.value).toBe("none");
  });
});

describe("free-text symptom detection", () => {
  it("turns 'pain on the left side' into a pain flow that asks where", () => {
    const st = detectSymptomStart("I have pain on my left side", [])!;
    expect(st).toMatchObject({ complaint: "pain", side: "left" });
    const q = nextQuestion(seedFromStart(start(), st), adult)!;
    expect(q.key).toBe("pain_location");
    expect(q.text).toMatch(/narrow it down/i);
  });
  it("leaves readings, medicines and reports to their own agents", () => {
    expect(detectSymptomStart("my sugar is 180 after lunch", [])).toBeNull();
    expect(detectSymptomStart("can I take my metformin tablet", [])).toBeNull();
  });
});

describe("test result reference bands", () => {
  it("classifies HbA1c with ADA bands", () => {
    expect(VALUE_TESTS.hba1c!.band(5.4, { sex: null }).tone).toBe("ok");
    expect(VALUE_TESTS.hba1c!.band(6.0, { sex: null }).label).toMatch(/prediabetes/i);
    expect(VALUE_TESTS.hba1c!.band(7.2, { sex: null }).doctor).toBe("Diabetologist");
  });
  it("uses sex-specific haemoglobin ranges", () => {
    expect(VALUE_TESTS.haemoglobin!.band(12.5, { sex: "female" }).tone).toBe("ok");
    expect(VALUE_TESTS.haemoglobin!.band(12.5, { sex: "male" }).tone).toBe("borderline");
  });
});
