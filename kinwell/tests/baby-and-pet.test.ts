import { beforeAll, describe, expect, it } from "vitest";
import { applyBabyAnswer, babyDecide, babyNextQuestion } from "@/lib/ai/guided/baby-engine";
import { applyVetAnswer, vetDecide, vetNextQuestion } from "@/lib/ai/guided/vet-engine";
import { categoryFromText, mentionedSubject } from "@/lib/ai/guided/detect";
import { emptyState, type GuidedState } from "@/lib/ai/guided/types";
import { createConversation, getConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import { createProfile } from "@/lib/services/profiles";
import type { ChatCard, QuestionCard } from "@/lib/ai/types";
import { createWorld, type TestWorld } from "./helpers";

const baby = (ageMonths?: number): GuidedState => ({ ...emptyState("symptom", "p"), patient: { kind: "baby", label: "your baby", saved: false, ageMonths } });
const pet = (species?: string): GuidedState => ({ ...emptyState("symptom", "p"), patient: { kind: "pet", label: "your pet", saved: false, species } });
const b = (s: GuidedState, key: string, value: string) => applyBabyAnswer(s, { key, value });
const v = (s: GuidedState, key: string, value: string) => applyVetAnswer(s, { key, value });

describe("newborn safety mode", () => {
  it("asks the baby's age first, then what's wrong, then danger signs before anything else", () => {
    expect(babyNextQuestion(baby(), "your baby")!.key).toBe("baby_age");
    let s = b(baby(), "baby_age", "2");
    expect(babyNextQuestion(s, "your baby")!.key).toBe("baby_category");
    s = b(s, "baby_category", "feeding");
    expect(babyNextQuestion(s, "your baby")!.key).toBe("baby_danger");
  });

  it("treats 38°C or higher in a baby under 3 months as needing prompt assessment now (AAP)", () => {
    let s = b(b(b(baby(), "baby_age", "2"), "baby_category", "fever"), "baby_danger", "none");
    s = b(s, "baby_temp", "38_39");
    const d = babyDecide(s, "your baby");
    expect(d.kind).toBe("escalate");
    if (d.kind === "escalate") expect(d.reasons.join(" ")).toMatch(/under 3 months/);
  });

  it("does not escalate the same temperature in a 9-month-old on its own", () => {
    let s = b(b(b(baby(), "baby_age", "9"), "baby_category", "fever"), "baby_danger", "none");
    s = b(s, "baby_temp", "38_39");
    expect(babyDecide(s, "your baby").kind).toBe("ask");
  });

  it("escalates danger signs as an emergency at any age", () => {
    const s = b(b(b(baby(), "baby_age", "4.5"), "baby_category", "feeding"), "baby_danger", "hard_to_wake");
    const d = babyDecide(s, "your baby");
    expect(d.kind === "escalate" && d.level).toBe("emergency");
  });

  it("flags poor feeding and few wet diapers as same-day care, and never reassures a newborn without a doctor", () => {
    let s = b(b(b(baby(), "baby_age", "4.5"), "baby_category", "feeding"), "baby_danger", "none");
    s = b(b(s, "baby_temp", "under_38"), "feed_amount", "under_half");
    expect(babyDecide(s, "your baby")).toMatchObject({ kind: "escalate", level: "urgent" });

    let n = b(b(b(baby(), "baby_age", "0.5"), "baby_category", "crying"), "baby_danger", "none");
    n = b(b(b(n, "baby_temp", "under_38"), "feed_amount", "normal"), "baby_duration", "today");
    const d = babyDecide(n, "your baby");
    expect(d.kind === "complete" && d.outcome.speciality).toBe("Paediatrician");
  });
});

describe("veterinary mode", () => {
  it("asks species, problem and then urgent signs", () => {
    expect(vetNextQuestion(pet(), "your pet")!.key).toBe("pet_species");
    let s = v(pet(), "pet_species", "cat");
    expect(vetNextQuestion(s, "your pet")!.key).toBe("pet_category");
    s = v(s, "pet_category", "not_eating");
    expect(vetNextQuestion(s, "your pet")!.key).toBe("pet_danger");
  });

  it("treats suspected poisoning as an emergency and never suggests inducing vomiting", () => {
    let s = v(v(v(pet("dog"), "pet_category", "poison"), "pet_danger", "none"), "pet_toxin", "chocolate");
    const d = vetDecide(s, "your pet");
    expect(d.kind === "escalate" && d.level).toBe("emergency");
    if (d.kind === "escalate") expect(d.reasons.join(" ")).toMatch(/Don't make your pet vomit unless a vet tells you/);
    s = v(v(v(pet("cat"), "pet_category", "urine"), "pet_danger", "none"), "pet_urine", "none");
    expect(vetDecide(s, "your pet")).toMatchObject({ kind: "escalate", level: "emergency" });
  });

  it("sends a cat that hasn't eaten for over a day to a vet the same day", () => {
    const s = v(v(v(pet("cat"), "pet_category", "not_eating"), "pet_danger", "none"), "pet_duration", "1_2_days");
    expect(vetDecide(s, "your pet")).toMatchObject({ kind: "escalate", level: "urgent" });
  });

  it("always warns against human medicines in pet self-care", () => {
    let s = v(v(v(pet("dog"), "pet_category", "vomiting"), "pet_danger", "none"), "pet_duration", "under_day");
    for (const [k, val] of [["pet_vomit_count", "once"], ["pet_water", "normal"], ["pet_energy", "normal"], ["pet_extra", "none"]] as const) s = v(s, k, val);
    const d = vetDecide(s, "your pet");
    expect(d.kind).toBe("complete");
    if (d.kind === "complete") expect(d.outcome.selfCare.join(" ")).toMatch(/Don't give any human medicine/);
  });
});

describe("free-text subject detection", () => {
  it("recognises babies and pets", () => {
    expect(mentionedSubject("My dog hasn't eaten since yesterday")).toBe("pet");
    expect(mentionedSubject("My baby isn't eating")).toBe("baby");
    expect(mentionedSubject("My stomach hurts")).toBeNull();
    expect(categoryFromText("My dog hasn't eaten since yesterday", "pet")).toBe("not_eating");
    expect(categoryFromText("My two-month-old baby is not drinking milk properly", "baby")).toBe("feeding");
    expect(categoryFromText("My cat is vomiting", "pet")).toBe("vomiting");
  });
});

describe("baby and pet conversations", () => {
  let w: TestWorld;
  beforeAll(async () => {
    delete process.env.ENABLE_DOCTOR_PORTAL;
    w = await createWorld();
  });
  const question = (cards: ChatCard[]) => cards.find((c): c is QuestionCard => c.type === "question");

  it("Check a Symptom starts with 'Who is this about?', including a pet already in the family", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const m = (await handleUserMessage(w.demo, conv, "Check a Symptom", { answer: { key: "start", value: "symptom" } })).assistantMessage;
    const q = question(m.cards)!;
    expect(m.content).toBe("Who is this about?");
    expect(q.options.map((o) => o.label)).toEqual(expect.arrayContaining(["Neerja (me)", "Mom", "Dad", "Bruno", "My baby", "Someone else"]));
  });

  it("a newborn with fever gets prompt-care advice, not feeding tips — and nothing is saved to the wrong record", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    // The age is in the message and "not drinking milk" answers the category, so it goes straight to danger signs.
    let m = (await handleUserMessage(w.demo, conv, "My two-month-old baby is not drinking milk properly")).assistantMessage;
    expect(question(m.cards)?.key).toBe("baby_danger");
    m = (await handleUserMessage(w.demo, conv, "None of these", { answer: { key: "baby_danger", value: "none" } })).assistantMessage;
    m = (await handleUserMessage(w.demo, conv, "38–39°C", { answer: { key: "baby_temp", value: "38_39" } })).assistantMessage;
    expect(m.content).toMatch(/under 3 months with a temperature of 38°C/);
    expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "same_day" });
    const { conversation } = await getConversation(w.demo, conv);
    expect(conversation.active_profile_id).toBe(w.profiles.me);
  });

  it("pet emergencies typed in text go to emergency vet care, never the human emergency number", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const m = (await handleUserMessage(w.demo, conv, "My dog is having a seizure and collapsed")).assistantMessage;
    expect(m.content).toMatch(/emergency veterinary care/);
    expect(m.content).not.toMatch(/112/);
    expect(m.cards.find((c) => c.type === "emergency")).toMatchObject({ audience: "vet" });
  });

  it("a saved pet profile goes straight into vet mode with its species", async () => {
    const bruno = (await w.db.query<{ id: string }>("select id from profiles where family_id = $1 and relationship = 'pet'", [w.demo.familyId])).rows[0]!.id;
    const conv = await createConversation(w.demo, w.profiles.me);
    await handleUserMessage(w.demo, conv, "Check a Symptom", { answer: { key: "start", value: "symptom" } });
    let m = (await handleUserMessage(w.demo, conv, "Bruno", { answer: { key: "who_for", value: `profile:${bruno}` } })).assistantMessage;
    expect(question(m.cards)?.key).toBe("pet_category");
    m = (await handleUserMessage(w.demo, conv, "Limping", { answer: { key: "pet_category", value: "limping" } })).assistantMessage;
    expect(question(m.cards)?.key).toBe("pet_danger");
    m = (await handleUserMessage(w.demo, conv, "None of these", { answer: { key: "pet_danger", value: "none" } })).assistantMessage;
    m = (await handleUserMessage(w.demo, conv, "Yes", { answer: { key: "pet_weight_bearing", value: "yes" } })).assistantMessage;
    const rec = m.cards.find((c) => c.type === "doctor_recommendation");
    expect(rec && rec.type === "doctor_recommendation" && rec.speciality).toBe("Veterinarian");
    expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "clinician", audience: "vet" });
    const { conversation } = await getConversation(w.demo, conv);
    expect(conversation.title).toBe("Bruno's limping");
  });

  it("pet profiles need a species", async () => {
    await expect(createProfile(w.demo, w.demo.familyId, { displayName: "Milo", relationship: "pet" })).rejects.toThrow();
    const milo = await createProfile(w.demo, w.demo.familyId, { displayName: "Milo", relationship: "pet", species: "cat" });
    expect(milo.species).toBe("cat");
  });
});
