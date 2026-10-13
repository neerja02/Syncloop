import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { applyAnswer, decide, nextQuestion, screen, type PatientFacts } from "@/lib/ai/guided/symptom-engine";
import { detectSymptomStart, isMedicineQuestion } from "@/lib/ai/guided/detect";
import { emptyState, type GuidedState } from "@/lib/ai/guided/types";
import { createConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import { uploadReport } from "@/lib/services/reports";
import { getProfile, updateProfile } from "@/lib/services/profiles";
import { PATIENT_TIMELINE_KINDS } from "@/lib/services/timeline";
import type { ChatCard, QuestionCard } from "@/lib/ai/types";
import { createWorld, type TestWorld } from "./helpers";

const adult: PatientFacts = { name: "Neerja", isSelf: true, age: 38, sex: "female", pregnant: false, conditions: [] };
const dad: PatientFacts = { ...adult, name: "Dad", isSelf: false, age: 68, sex: "male" };
const fall = () => applyAnswer(emptyState("symptom", "p"), { key: "symptom_category", value: "fall" });
const ans = (s: GuidedState, ...pairs: [string, string][]) => pairs.reduce((acc, [key, value]) => applyAnswer(acc, { key, value }), s);

describe("falls module", () => {
  it("screens for head injury and hip fracture signs first", () => {
    expect(nextQuestion(fall(), dad)!.key).toBe("fall_redflags");
    expect(screen(ans(fall(), ["fall_redflags", "knocked_out"]), dad)?.level).toBe("emergency");
    expect(screen(ans(fall(), ["fall_redflags", "confused"]), adult)?.level).toBe("emergency");
    expect(screen(ans(fall(), ["fall_redflags", "cant_stand"]), dad)).toMatchObject({ level: "urgent", reasons: [expect.stringMatching(/broken hip/)] });
  });
  it("asks about blood thinners after a head bump, and treats either as same-day care", () => {
    const s = ans(fall(), ["fall_redflags", "none"], ["fall_head", "yes"]);
    expect(nextQuestion(s, adult)!.key).toBe("fall_thinners");
    expect(screen(ans(s, ["fall_thinners", "yes"]), adult)?.reasons).toContain("A head injury while taking a blood thinner");
    expect(screen(ans(s, ["fall_thinners", "no"]), dad)?.reasons).toContain("A head injury at 65 or older");
    expect(screen(ans(s, ["fall_thinners", "no"]), adult)).toBeNull();
  });
  it("skips the blood-thinner question when the head wasn't hit", () => {
    expect(nextQuestion(ans(fall(), ["fall_redflags", "none"], ["fall_head", "no"]), adult)!.key).toBe("fall_why");
  });
  it("lets a simple trip be managed at home, but a dizzy fall or repeat falls go to a GP", () => {
    const trip = ans(fall(), ["fall_redflags", "none"], ["fall_head", "no"], ["fall_why", "trip"], ["severity", "mild"], ["fall_before", "first"]);
    const d = decide(trip, adult);
    expect(d.kind === "complete" && d.outcome.level).toBe("self_care");
    const dizzy = ans(trip, ["fall_why", "dizzy"]);
    const d2 = decide(dizzy, adult);
    expect(d2.kind === "complete" && d2.outcome.speciality).toBe("General Physician");
    expect(d2.kind === "complete" && d2.outcome.headline).toMatch(/without a clear trip/);
    const older = decide(trip, dad);
    expect(older.kind === "complete" && older.outcome.speciality).toBe("General Physician");
  });
  it("detects a fall in text, but not hair fall", () => {
    expect(detectSymptomStart("My dad fell in the bathroom this morning", [])).toMatchObject({ complaint: "fall" });
    expect(detectSymptomStart("I had a fall yesterday", [])).toMatchObject({ complaint: "fall" });
    expect(detectSymptomStart("Hair fall is bad", [])).toMatchObject({ complaint: "hair" });
  });
});

describe("in the app", () => {
  let w: TestWorld;
  let bruno: string;
  beforeAll(async () => {
    delete process.env.ENABLE_DOCTOR_PORTAL;
    w = await createWorld();
    bruno = (await w.db.query<{ id: string }>("select id from profiles where family_id = $1 and relationship = 'pet'", [w.demo.familyId])).rows[0]!.id;
  });
  const question = (cards: ChatCard[]) => cards.find((c): c is QuestionCard => c.type === "question");
  const say = async (conv: string, text: string, answer?: { key: string; value: string }) => (await handleUserMessage(w.demo, conv, text, answer ? { answer } : {})).assistantMessage;

  it("a typed fall starts the falls questions", async () => {
    const conv = await createConversation(w.demo, w.profiles.dad);
    const m = await say(conv, "He fell in the bathroom this morning");
    expect(question(m.cards)?.key).toBe("fall_redflags");
  });

  describe("medicine safety", () => {
    it("never suggests human medicine for a pet", async () => {
      expect(isMedicineQuestion("Can I give my dog paracetamol?")).toBe(true);
      expect(isMedicineQuestion("My dog ate chocolate")).toBe(false);
      const conv = await createConversation(w.demo, w.profiles.me);
      const m = await say(conv, "Can I give my dog paracetamol?");
      expect(m.content).toMatch(/don't give your pet any human medicine/);
      expect(m.content).toMatch(/fatal to cats/);
      expect(m.cards.find((c) => c.type === "doctor_recommendation")).toMatchObject({ speciality: "Veterinarian" });
    });
    it("treats a pet that already swallowed a medicine as a vet emergency", async () => {
      const conv = await createConversation(w.demo, bruno);
      const m = await say(conv, "Bruno has had one of my ibuprofen tablets, can I give him something?");
      expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ audience: "vet" });
      expect(m.content).not.toMatch(/112/);
    });
    it("doesn't give baby doses, and puts the under-3-months fever rule first", async () => {
      const conv = await createConversation(w.demo, w.profiles.me);
      const m = await say(conv, "Can I give my baby paracetamol?");
      expect(m.content).toMatch(/I won't suggest a dose/);
      expect(m.content).toMatch(/under 3 months/);
      expect(m.cards.find((c) => c.type === "doctor_recommendation")).toMatchObject({ speciality: "Paediatrician" });
    });
    it("adds older-adult cautions for painkillers", async () => {
      const conv = await createConversation(w.demo, w.profiles.dad);
      const m = await say(conv, "Can I take ibuprofen?");
      const info = m.cards.find((c) => c.type === "medication_info");
      expect(info && info.type === "medication_info" && info.cautions.join(" ")).toMatch(/After 65/);
    });
  });

  it("asks the right questions for new photo types", async () => {
    const raw = Buffer.alloc(800 * 800 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = 60 + Math.floor(Math.random() * 140);
    const buffer = await sharp(raw, { raw: { width: 800, height: 800, channels: 3 } }).png().toBuffer();
    const photo = (profileId: string) => uploadReport(w.demo, { profileId, purpose: "photo", file: { name: "photo.png", type: "image/png", size: buffer.length, buffer } });

    let conv = await createConversation(w.demo, w.profiles.me);
    let m = await say(conv, "Shared a photo", { key: "photo_file", value: await photo(w.profiles.me) });
    expect(question(m.cards)?.options.map((o) => o.value)).toEqual(expect.arrayContaining(["throat", "nail", "scalp", "stool", "pet_ear"]));
    m = await say(conv, "Scalp or hair", { key: "photo_subject", value: "scalp" });
    expect(question(m.cards)?.key).toBe("hair_pattern");

    conv = await createConversation(w.demo, bruno);
    await say(conv, "Shared a photo", { key: "photo_file", value: await photo(bruno) });
    m = await say(conv, "My pet's ear or eye", { key: "photo_subject", value: "pet_ear" });
    expect(question(m.cards)?.key).toBe("pet_danger");
    m = await say(conv, "None of these", { key: "pet_danger", value: "none" });
    m = await say(conv, "1–2 days", { key: "pet_duration", value: "1_2_days" });
    expect(question(m.cards)?.key).toBe("pet_skin_signs");
    expect(question(m.cards)?.options.map((o) => o.value)).toEqual(expect.arrayContaining(["head_shaking", "discharge", "smell"]));
  });

  it("keeps a pet a pet when its profile is edited, with vaccinations and diet", async () => {
    await updateProfile(w.demo, bruno, { displayName: "Bruno", relationship: "pet", species: "dog", breed: "Labrador", neutered: "yes", lifestyle: { diet: "Dry food twice a day", vaccinations: "Rabies up to date" } });
    const p = await getProfile(w.demo, bruno);
    expect(p).toMatchObject({ relationship: "pet", species: "dog", neutered: true });
    expect(p.lifestyle).toMatchObject({ diet: "Dry food twice a day", vaccinations: "Rabies up to date" });
  });

  it("stores a child's birth details", async () => {
    const id = (await w.db.query<{ id: string }>("insert into profiles(family_id, display_name, relationship) values ($1, 'Aarav', 'child') returning id", [w.demo.familyId])).rows[0]!.id;
    await updateProfile(w.demo, id, { displayName: "Aarav", relationship: "child", lifestyle: { bornWeeks: "35", birthWeightKg: "2.4", feeding: "mixed" } });
    expect((await getProfile(w.demo, id)).lifestyle).toMatchObject({ bornWeeks: 35, birthWeightKg: 2.4, feeding: "mixed" });
  });

  it("the timeline includes medicines and doctor visits", () => {
    expect(PATIENT_TIMELINE_KINDS).toEqual(expect.arrayContaining(["medication", "appointment"]));
  });
});
