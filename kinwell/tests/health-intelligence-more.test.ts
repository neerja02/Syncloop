import { beforeAll, describe, expect, it } from "vitest";
import { applyAnswer, decide, nextQuestion, screen, symptomCategoryQuestion, type PatientFacts } from "@/lib/ai/guided/symptom-engine";
import { detectSymptomStart } from "@/lib/ai/guided/detect";
import { emptyState, type GuidedState } from "@/lib/ai/guided/types";
import { createConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import type { ChatCard, QuestionCard } from "@/lib/ai/types";
import { createWorld, type TestWorld } from "./helpers";

const woman: PatientFacts = { name: "Neerja", isSelf: true, age: 32, sex: "female", pregnant: false, conditions: [] };
const man: PatientFacts = { ...woman, name: "Dad", isSelf: false, age: 68, sex: "male" };
const start = (complaint: string) => applyAnswer(emptyState("symptom", "p"), { key: "symptom_category", value: complaint });
const ans = (s: GuidedState, ...pairs: [string, string][]) => pairs.reduce((acc, [key, value]) => applyAnswer(acc, { key, value }), s);
const complete = (s: GuidedState, f: PatientFacts) => {
  const d = decide(s, f);
  if (d.kind !== "complete") throw new Error(`expected an outcome, got ${d.kind === "ask" ? `question ${d.question.key}` : "an escalation"}`);
  return d.outcome;
};

describe("detecting the new checks from text", () => {
  it.each([
    ["I have an earache", { complaint: "ent", answers: { ent_part: "ear" } }],
    ["My sinuses are blocked and my face hurts", { complaint: "ent", answers: { ent_part: "nose" } }],
    ["My voice has been hoarse for a month", { complaint: "ent", answers: { ent_part: "throat" } }],
    ["I have a toothache", { complaint: "dental", answers: { dental_issue: "toothache" } }],
    ["Daant mein dard hai", { complaint: "dental" }],
    ["My gums bleed when I brush", { complaint: "dental", answers: { dental_issue: "gums" } }],
    ["Burning when I pee", { complaint: "urinary", answers: { urine_issue: "burning" } }],
    ["There's blood in my urine", { complaint: "urinary", answers: { urine_issue: "blood" } }],
    ["I snore really loudly", { complaint: "sleep", answers: { sleep_issue: "apnoea" } }],
    ["I'm 30 weeks pregnant and have a headache", { complaint: "pregnancy", answers: { preg_stage: "late" } }],
    ["Since giving birth my stitches hurt", { complaint: "pregnancy", answers: { preg_stage: "postpartum" } }],
  ])("%s", (text, expected) => {
    expect(detectSymptomStart(text, [])).toMatchObject(expected);
  });
  it("only offers the pregnancy check where it can apply", () => {
    expect(symptomCategoryQuestion(woman).options.map((o) => o.value)).toContain("pregnancy");
    expect(symptomCategoryQuestion(man).options.map((o) => o.value)).not.toContain("pregnancy");
  });
});

describe("ear, nose and throat", () => {
  const throat = () => ans(start("ent"), ["ent_part", "throat"]);
  it("treats drooling or noisy breathing as an emergency, and one-sided severe pain as same-day", () => {
    expect(screen(ans(throat(), ["ent_redflags", "drool"]), woman)?.level).toBe("emergency");
    expect(screen(ans(throat(), ["ent_redflags", "stridor"]), woman)?.level).toBe("emergency");
    expect(screen(ans(throat(), ["ent_redflags", "quinsy"]), woman)?.level).toBe("urgent");
  });
  it("tells tonsillitis apart from a viral sore throat", () => {
    const tonsils = complete(ans(throat(), ["ent_redflags", "none"], ["onset", "1_3_days"], ["throat_signs", "fever|patches|glands"]), woman);
    expect(tonsils.possibilities![0]).toMatch(/tonsillitis/);
    expect(tonsils.speciality).toBe("General Physician");
    const viral = complete(ans(throat(), ["ent_redflags", "none"], ["onset", "1_3_days"], ["throat_signs", "cough"]), woman);
    expect(viral.level).toBe("self_care");
    expect(viral.possibilities![0]).toMatch(/viral sore throat/);
  });
  it("sends a hoarse voice lasting 3 weeks to an ENT specialist", () => {
    const o = complete(ans(throat(), ["ent_redflags", "none"], ["onset", "over_3_weeks"], ["throat_signs", "hoarse"]), man);
    expect(o.speciality).toBe("ENT Specialist");
  });
  it("treats sudden one-sided hearing loss as same-day", () => {
    expect(screen(ans(start("ent"), ["ent_part", "ear"], ["ent_redflags", "sudden_hearing"]), woman)?.level).toBe("urgent");
  });
});

describe("teeth and mouth", () => {
  it("spreading facial swelling is an emergency; jaw pain with chest symptoms is treated as the heart", () => {
    expect(screen(ans(start("dental"), ["dental_issue", "swelling"], ["dental_redflags", "spread"]), woman)?.level).toBe("emergency");
    expect(screen(ans(start("dental"), ["dental_issue", "jaw"], ["dental_redflags", "cardiac"]), man)?.reasons.join()).toMatch(/heart/);
  });
  it("toothache goes to a dentist; a mouth patch that won't heal is checked", () => {
    expect(complete(ans(start("dental"), ["dental_issue", "toothache"], ["dental_redflags", "none"], ["onset", "1_3_days"], ["tooth_signs", "throbbing"]), woman).speciality).toBe("Dentist");
    const patch = complete(ans(start("dental"), ["dental_issue", "ulcer"], ["dental_redflags", "none"], ["onset", "over_3_weeks"], ["ulcer_kind", "patch"]), man);
    expect(patch.possibilities![0]).toMatch(/needs checking/);
  });
});

describe("urinary", () => {
  const urine = (issue: string) => ans(start("urinary"), ["urine_issue", issue]);
  it("escalates retention, kidney infection and an infected stone", () => {
    expect(screen(ans(urine("burning"), ["urine_redflags", "none_passed"]), man)?.level).toBe("urgent");
    expect(screen(ans(urine("burning"), ["urine_redflags", "fever|loin"]), woman)?.reasons.join()).toMatch(/kidney infection/);
    expect(screen(ans(urine("colic"), ["urine_redflags", "fever"]), woman)?.level).toBe("emergency");
  });
  it("a short, uncomplicated UTI in a woman can be self-managed; the same in an older man is checked", () => {
    const s = (f: PatientFacts) => complete(ans(urine("burning"), ["urine_redflags", "none"], ["onset", "today"], ["urine_signs", "cloudy"]), f);
    expect(s(woman).level).toBe("self_care");
    expect(s(woman).possibilities!.join()).toMatch(/bladder infection/);
    expect(s(man).speciality).toBe("General Physician");
  });
  it("painless blood in the urine always goes to a Urologist", () => {
    const o = complete(ans(urine("blood"), ["urine_redflags", "none"], ["onset", "today"], ["blood_pain", "no"]), man);
    expect(o.speciality).toBe("Urologist");
  });
});

describe("sleep", () => {
  it("falling asleep at the wheel is same-day; snoring with pauses goes to a sleep study", () => {
    expect(screen(ans(start("sleep"), ["sleep_issue", "sleepy"], ["sleep_redflags", "driving"]), man)?.level).toBe("urgent");
    const o = complete(ans(start("sleep"), ["sleep_issue", "apnoea"], ["sleep_redflags", "witnessed"], ["onset", "over_3_months"], ["apnoea_signs", "snoring|unrefreshed"]), man);
    expect(o.speciality).toBe("Pulmonologist");
    expect(o.possibilities![0]).toMatch(/sleep apnoea/);
  });
});

describe("pregnancy and after birth", () => {
  const preg = (stage: string) => ans(start("pregnancy"), ["preg_stage", stage]);
  it("asks pregnancy-stage-specific warning signs", () => {
    expect(nextQuestion(preg("late"), woman)!.options.map((o) => o.value)).toContain("movement");
    expect(nextQuestion(preg("early"), woman)!.options.map((o) => o.value)).toContain("ectopic");
    expect(nextQuestion(preg("postpartum"), woman)!.options.map((o) => o.value)).toEqual(expect.arrayContaining(["pph", "pe", "harm"]));
  });
  it("escalates bleeding, reduced movements, pre-eclampsia signs and heavy bleeding after birth", () => {
    expect(screen(ans(preg("early"), ["preg_redflags", "bleeding"]), woman)?.level).toBe("emergency");
    expect(screen(ans(preg("late"), ["preg_redflags", "movement"]), woman)?.reasons.join()).toMatch(/maternity unit now/);
    expect(screen(ans(preg("mid"), ["preg_redflags", "pet"]), woman)?.reasons.join()).toMatch(/pre-eclampsia/);
    expect(screen(ans(preg("postpartum"), ["preg_redflags", "pph"]), woman)?.level).toBe("emergency");
  });
  it("itching in pregnancy needs a blood test", () => {
    const o = complete(ans(preg("late"), ["preg_redflags", "none"], ["preg_concern", "itch"]), { ...woman, pregnant: true });
    expect(o.possibilities![0]).toMatch(/obstetric cholestasis/);
    expect(o.speciality).toBe("Gynaecologist");
  });
  it("doesn't send ordinary pregnancy heartburn to a doctor", () => {
    expect(complete(ans(preg("mid"), ["preg_redflags", "none"], ["preg_concern", "heartburn"]), { ...woman, pregnant: true }).level).toBe("self_care");
  });
});

describe("fever: infection and exposure", () => {
  const fever = () => ans(start("fever"), ["fever_temp", "high"], ["fever_duration", "3_4_days"], ["fever_redflags", "none"], ["fever_associated", "aches"]);
  it("asks about exposure, then dengue warning signs for mosquito exposure", () => {
    expect(nextQuestion(fever(), woman)!.key).toBe("fever_exposure");
    expect(nextQuestion(ans(fever(), ["fever_exposure", "mosquito"]), woman)!.key).toBe("dengue_signs");
  });
  it("dengue warning signs mean hospital today; otherwise a blood test after 3 days", () => {
    expect(screen(ans(fever(), ["fever_exposure", "mosquito"], ["dengue_signs", "bleeding"]), woman)?.reasons.join()).toMatch(/dengue/);
    const o = complete(ans(fever(), ["fever_exposure", "mosquito"], ["dengue_signs", "none"]), woman);
    expect(o.possibilities![0]).toMatch(/dengue or malaria/);
    expect(o.reason).toMatch(/dengue and malaria tests/);
  });
  it("an animal bite needs same-day care for rabies protection", () => {
    expect(screen(ans(fever(), ["fever_exposure", "bite"]), woman)?.reasons.join()).toMatch(/rabies/);
  });
});

describe("in conversation", () => {
  let w: TestWorld;
  beforeAll(async () => {
    delete process.env.ENABLE_DOCTOR_PORTAL;
    w = await createWorld();
  });
  const question = (cards: ChatCard[]) => cards.find((c): c is QuestionCard => c.type === "question");

  it("'I'm 30 weeks pregnant and have a headache' goes straight to pregnancy warning signs", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const m = (await handleUserMessage(w.demo, conv, "I'm 30 weeks pregnant and have a bad headache")).assistantMessage;
    expect(question(m.cards)?.key).toBe("preg_redflags");
    expect(question(m.cards)?.options.map((o) => o.value)).toEqual(expect.arrayContaining(["pet", "movement"]));
  });
  it("thoughts of harming yourself or the baby after birth get the crisis response", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    await handleUserMessage(w.demo, conv, "Since giving birth I've been struggling");
    const m = (await handleUserMessage(w.demo, conv, "Thoughts of harming myself or the baby", { answer: { key: "preg_redflags", value: "harm" } })).assistantMessage;
    expect(m.cards.some((c) => c.type === "emergency" && !!c.crisisLine)).toBe(true);
  });
});
