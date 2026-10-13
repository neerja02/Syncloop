import { beforeAll, describe, expect, it } from "vitest";
import { createConversation, getConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import { uploadReport } from "@/lib/services/reports";
import { getMyDoctor, saveMyDoctor, getSavedCity } from "@/lib/services/my-doctor";
import { ForbiddenError } from "@/lib/security/access";
import type { ChatCard, QuestionCard } from "@/lib/ai/types";
import { createWorld, type TestWorld } from "./helpers";

let w: TestWorld;
beforeAll(async () => {
  delete process.env.ENABLE_DOCTOR_PORTAL;
  w = await createWorld();
});

type Answer = { key: string; value: string };
async function tap(conv: string, label: string, a: Answer) {
  return (await handleUserMessage(w.demo, conv, label, { answer: a })).assistantMessage;
}
const question = (cards: ChatCard[]) => cards.find((c): c is QuestionCard => c.type === "question");
const allActions = (cards: ChatCard[]) => cards.flatMap((c) => (c.type === "actions" || c.type === "measurement_result" ? c.actions : []));

describe("guided symptom chat (tap to answer)", () => {
  it("Check a Symptom → Pain → Left chest asks red-flag questions, and concerning answers stop the chat with an emergency card", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    let m = await tap(conv, "Check a Symptom", { key: "start", value: "symptom" });
    expect(m.content).toBe("Who is this about?");
    m = await tap(conv, "Neerja (me)", { key: "who_for", value: `profile:${w.profiles.me}` });
    expect(m.content).toBe("What are you experiencing?");
    expect(question(m.cards)?.style).toBe("symptoms");
    m = await tap(conv, "Pain", { key: "symptom_category", value: "pain" });
    expect(question(m.cards)?.key).toBe("pain_location");
    m = await tap(conv, "Left chest", { key: "pain_location", value: "left:chest" });
    expect(question(m.cards)?.key).toBe("chest_redflags");
    m = await tap(conv, "Sweating, Pain spreading to arm, jaw or back", { key: "chest_redflags", value: "sweating|spreading" });
    expect(m.urgency).toBe("EMERGENCY");
    const card = m.cards.find((c) => c.type === "emergency");
    expect(card).toBeTruthy();
    expect(card && "emergencyNumber" in card && card.emergencyNumber).toBe("112");
    // The previously asked question is closed once answered.
    const { messages, conversation } = await getConversation(w.demo, conv);
    const openQuestions = messages.flatMap((x) => x.cards).filter((c) => c.type === "question" && c.status === "open");
    expect(openQuestions).toHaveLength(0);
    expect(conversation.title).toBe("Left-side chest pain");
  });

  it("non-urgent answers lead to a doctor category recommendation — with no doctor-portal or appointment actions", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    await handleUserMessage(w.demo, conv, "I have pain on my left side");
    const steps: [string, Answer][] = [
      ["Upper stomach", { key: "pain_location", value: "upper_abdomen" }],
      ["4–7 days ago", { key: "onset", value: "4_7_days" }],
      ["Moderate — 4 to 6", { key: "severity", value: "moderate" }],
      ["Dull / aching", { key: "pain_character", value: "dull" }],
      ["None of these", { key: "abdomen_associated", value: "none" }],
    ];
    let m;
    for (const [label, a] of steps) m = await tap(conv, label, a);
    m = await tap(conv, "About the same", { key: "pain_trend", value: "same" });
    const rec = m.cards.find((c) => c.type === "doctor_recommendation");
    expect(rec && rec.type === "doctor_recommendation" && rec.speciality).toBe("General Physician");
    expect(m.content).toMatch(/doesn't appear to show the emergency signs/);
    expect(m.cards.some((c) => c.type === "doctor_guidance")).toBe(false);
    expect(allActions(m.cards).some((a) => a.kind === "send_review" || a.kind === "book_appointment")).toBe(false);
  });

  it("free text while a question is open is matched to the options", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    await tap(conv, "Check a Symptom", { key: "start", value: "symptom" });
    await tap(conv, "Neerja (me)", { key: "who_for", value: `profile:${w.profiles.me}` });
    await tap(conv, "Headache", { key: "symptom_category", value: "headache" });
    const m = (await handleUserMessage(w.demo, conv, "several hours")).assistantMessage;
    expect(question(m.cards)?.key).toBe("headache_severity");
  });

  it("asks 'Is this about Mom?' instead of attributing a relative's symptom to the wrong person", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const m = (await handleUserMessage(w.demo, conv, "My mother has stomach pain")).assistantMessage;
    expect(m.cards.some((c) => c.type === "profile_switch")).toBe(true);
  });
});

describe("doctor discovery", () => {
  it("asks for the city only when needed, then remembers it", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    let m = await tap(conv, "Yes, find a doctor", { key: "find_doctor", value: "Cardiologist" });
    expect(m.content).toBe("Which city are you in?");
    expect(question(m.cards)?.style).toBe("location");
    m = await tap(conv, "Pune", { key: "city", value: "Pune" });
    const results = m.cards.find((c) => c.type === "doctor_results");
    expect(results && results.type === "doctor_results" && results.results[0]?.speciality).toMatch(/Cardio/);
    expect(await getSavedCity(w.demo.id)).toBe("Pune");
    // Next time: straight to results.
    const conv2 = await createConversation(w.demo, w.profiles.me);
    m = await tap(conv2, "Yes, find a doctor", { key: "find_doctor", value: "General Physician" });
    expect(m.cards.some((c) => c.type === "doctor_results")).toBe(true);
  });
});

describe("test results and reports", () => {
  it("Understand a Test Result → Blood Sugar completes mostly with taps and skips the diabetes question when the profile already knows", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    await tap(conv, "Understand a Test Result", { key: "start", value: "test_result" });
    let m = await tap(conv, "Blood Sugar", { key: "test_pick", value: "blood_sugar" });
    expect(question(m.cards)?.style).toBe("number");
    m = await tap(conv, "182 mg/dL", { key: "sugar_value", value: "182" });
    expect(question(m.cards)?.key).toBe("sugar_timing");
    m = await tap(conv, "2 hours after food", { key: "sugar_timing", value: "after_120" });
    // Neerja's profile records diabetes, so the next step offers her HbA1c report rather than asking about diabetes.
    expect(question(m.cards)?.key).toBe("use_related");
    expect(m.content).toMatch(/HbA1c report/);
    m = await tap(conv, "Yes", { key: "use_related", value: "yes" });
    const card = m.cards.find((c) => c.type === "measurement_result");
    expect(card && card.type === "measurement_result" && card.value).toBe(182);
  });

  it("explains a typed HbA1c value with bands and a doctor category", async () => {
    const conv = await createConversation(w.demo, w.profiles.dad);
    await tap(conv, "Understand a Test Result", { key: "start", value: "test_result" });
    await tap(conv, "HbA1c", { key: "test_pick", value: "hba1c" });
    await tap(conv, "Enter value", { key: "hba1c_how", value: "enter" });
    const m = await tap(conv, "6.1%", { key: "hba1c_value", value: "6.1" });
    expect(m.content).toMatch(/prediabetes range/);
    expect(m.cards.some((c) => c.type === "doctor_recommendation")).toBe(true);
  });

  it("Analyse a Report reads an uploaded report and says whose profile it belongs to", async () => {
    const text = "CityCare Diagnostics\nDate: 25/09/2026\nHbA1c 6.9 % 4.0 - 5.6\nHaemoglobin 13.4 g/dL 12.0 - 15.5";
    const id = await uploadReport(w.demo, { profileId: w.profiles.mom, file: { name: "mom-lab.txt", type: "text/plain", size: Buffer.byteLength(text), buffer: Buffer.from(text) } });
    const conv = await createConversation(w.demo, w.profiles.mom);
    let m = await tap(conv, "Analyse a Report", { key: "start", value: "report" });
    expect(question(m.cards)?.style).toBe("upload");
    m = await tap(conv, "Shared report: mom-lab", { key: "report_file", value: id });
    expect(m.cards.some((c) => c.type === "report_summary")).toBe(true);
    expect(m.content).toMatch(/HbA1c/);
  });
});

describe("My Doctor (patient-maintained contact)", () => {
  it("saves and reads the family's regular doctor, and keeps it private to the family", async () => {
    await saveMyDoctor(w.demo, w.demo.familyId, { name: "Dr. Amit Sharma", specialisation: "General Physician", clinic_name: "Apollo Clinic", phone: "+91 98765 43210", address: "12 FC Road", city: "Pune" });
    const d = await getMyDoctor(w.demo, w.demo.familyId);
    expect(d?.name).toBe("Dr. Amit Sharma");
    expect(d?.phone).toBe("+91 98765 43210");
    await saveMyDoctor(w.demo, w.demo.familyId, { name: "Dr. Amit Sharma", phone: "+91 98765 00000" });
    expect((await getMyDoctor(w.demo, w.demo.familyId))?.phone).toBe("+91 98765 00000");
    await expect(getMyDoctor(w.rivera, w.demo.familyId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveMyDoctor(w.demo, w.demo.familyId, { name: "D", phone: "abc" })).rejects.toThrow();
  });
});
