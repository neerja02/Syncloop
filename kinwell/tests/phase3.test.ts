import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createConversation, getConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import { uploadReport } from "@/lib/services/reports";
import { deliverDueFollowUp, dueFollowUps, scheduleFollowUp } from "@/lib/services/follow-ups";
import { PATIENT_TIMELINE_KINDS, profileTimeline } from "@/lib/services/timeline";
import { isHistoryQuestion } from "@/lib/ai/agents/timeline-agent";
import type { ChatCard, QuestionCard } from "@/lib/ai/types";
import { createWorld, type TestWorld } from "./helpers";

let w: TestWorld;
beforeAll(async () => {
  delete process.env.ENABLE_DOCTOR_PORTAL;
  w = await createWorld();
});

const question = (cards: ChatCard[]) => cards.find((c): c is QuestionCard => c.type === "question");
const tap = async (conv: string, label: string, answer?: { key: string; value: string }) => (await handleUserMessage(w.demo, conv, label, answer ? { answer } : {})).assistantMessage;

async function photo(kind: "blank" | "detailed") {
  const size = kind === "blank" ? 200 : 800;
  const raw = Buffer.alloc(size * size * 3);
  if (kind === "detailed") for (let i = 0; i < raw.length; i++) raw[i] = 60 + Math.floor(Math.random() * 140);
  else raw.fill(128);
  const buffer = await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
  return uploadReport(w.demo, { profileId: w.profiles.me, purpose: "skin", file: { name: `${kind}.png`, type: "image/png", size: buffer.length, buffer } });
}

describe("photo analysis", () => {
  it("asks for a clearer photo when the image can't be assessed", async () => {
    const id = await photo("blank");
    const conv = await createConversation(w.demo, w.profiles.me);
    const m = await tap(conv, "Shared a photo", { key: "photo_file", value: id });
    expect(question(m.cards)).toMatchObject({ key: "photo_retake", style: "upload" });
    expect(m.content).toMatch(/send another photo/);
  });

  it("without a vision model, asks what the photo shows and continues into the matching questions", async () => {
    const id = await photo("detailed");
    const conv = await createConversation(w.demo, w.profiles.me);
    let m = await tap(conv, "Shared a photo", { key: "photo_file", value: id });
    expect(question(m.cards)?.key).toBe("photo_subject");
    expect(m.content).toMatch(/saved the photo/);
    m = await tap(conv, "Wound, cut or burn", { key: "photo_subject", value: "wound" });
    expect(question(m.cards)?.key).toBe("wound_redflags");
    m = await tap(conv, "Bleeding that won't stop", { key: "wound_redflags", value: "bleeding" });
    expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "emergency" });
  });
});

describe("follow-up check-ins", () => {
  const makeDue = (conv: string) => w.db.query("update follow_ups set due_at = now() - interval '1 minute' where conversation_id = $1", [conv]);

  it("schedules a check-in from the end of a symptom check and delivers it when due", async () => {
    const conv = await createConversation(w.demo, w.profiles.mom);
    const m = await tap(conv, "Check in with me tomorrow", { key: "after_care", value: "checkin:24" });
    expect(m.content).toMatch(/tomorrow/);
    expect(await dueFollowUps(w.demo, w.demo.familyId)).toHaveLength(0);
    await makeDue(conv);
    expect((await dueFollowUps(w.demo, w.demo.familyId)).map((f) => f.conversation_id)).toContain(conv);
    expect(await deliverDueFollowUp(w.demo, conv)).toBe(true);
    expect(await deliverDueFollowUp(w.demo, conv)).toBe(false);
    const { messages } = await getConversation(w.demo, conv);
    const last = messages[messages.length - 1]!;
    expect(last.content).toMatch(/talked about Mom's symptoms\. How is Mom doing now\?/);
    expect(question(last.cards)?.key).toBe("followup_status");
  });

  it("'Better' ends with a monitor care level and records the outcome", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    await scheduleFollowUp(w.demo, { profileId: w.profiles.me, conversationId: conv, topic: "headache", hours: 24 });
    await makeDue(conv);
    await deliverDueFollowUp(w.demo, conv);
    const m = await tap(conv, "Better", { key: "followup_status", value: "better" });
    expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "monitor" });
    const timeline = await profileTimeline(w.demo, w.profiles.me, { kinds: ["check_in"] });
    expect(timeline[0]).toMatchObject({ title: "Check-in: headache", detail: "Felt better" });
  });

  it("'About the same' recommends the stored speciality", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    await scheduleFollowUp(w.demo, { profileId: w.profiles.me, conversationId: conv, topic: "rash", speciality: "Dermatologist", hours: 24 });
    await makeDue(conv);
    await deliverDueFollowUp(w.demo, conv);
    const m = await tap(conv, "About the same", { key: "followup_status", value: "same" });
    expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "clinician" });
    expect(m.cards.find((c) => c.type === "doctor_recommendation")).toMatchObject({ speciality: "Dermatologist" });
  });

  it("a typed 'it's worse' asks what changed, and breathing trouble escalates", async () => {
    const conv = await createConversation(w.demo, w.profiles.dad);
    await scheduleFollowUp(w.demo, { profileId: w.profiles.dad, conversationId: conv, topic: "cough", hours: 72 });
    await makeDue(conv);
    await deliverDueFollowUp(w.demo, conv);
    let m = await tap(conv, "It's worse today");
    expect(question(m.cards)?.key).toBe("followup_worse");
    m = await tap(conv, "Difficulty breathing", { key: "followup_worse", value: "breathing" });
    expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "emergency" });
  });

  it("'New symptoms' starts a fresh check for the same person", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    await scheduleFollowUp(w.demo, { profileId: w.profiles.me, conversationId: conv, topic: "acidity", hours: 24 });
    await makeDue(conv);
    await deliverDueFollowUp(w.demo, conv);
    const m = await tap(conv, "New symptoms", { key: "followup_status", value: "new" });
    expect(question(m.cards)?.key).toBe("symptom_category");
  });
});

describe("health timeline", () => {
  it("recognises history questions but not ordinary ones", () => {
    expect(isHistoryQuestion("When did my headaches start?")).toBe(true);
    expect(isHistoryQuestion("Show my last three cholesterol results")).toBe(true);
    expect(isHistoryQuestion("When was my baby's last fever?")).toBe(true);
    expect(isHistoryQuestion("Has my dog's weight changed?")).toBe(true);
    expect(isHistoryQuestion("I have a headache")).toBe(false);
    expect(isHistoryQuestion("What is a normal HbA1c?")).toBe(false);
  });

  it("answers 'when did my headaches start?' from saved symptoms", async () => {
    await w.db.query("insert into symptoms(profile_id, description, created_at) values ($1, 'Headache for a few hours', now() - interval '20 days'), ($1, 'Headache with nausea', now() - interval '2 days')", [w.profiles.me]);
    const conv = await createConversation(w.demo, w.profiles.me);
    const m = await tap(conv, "When did my headaches start?");
    expect(m.content).toMatch(/first record about "headache"/);
    expect(m.content).toMatch(/most recent/);
    expect(m.cards.some((c) => c.type === "info" && c.title === "From the health timeline")).toBe(true);
  });

  it("answers lab-history questions from confirmed results, oldest to newest on the chart", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const m = await tap(conv, "Show my last three HbA1c results");
    expect(m.content).toMatch(/last 3 HbA1c results\. (Lower|Higher|About the same)/);
    const trend = m.cards.find((c) => c.type === "trend");
    if (trend?.type !== "trend") throw new Error("no trend card");
    expect(trend.points.every((p) => typeof p.v === "number")).toBe(true);
    const times = trend.points.map((p) => new Date(p.t).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect((await tap(conv, "Show my last three TSH results")).content).toMatch(/couldn't find any TSH results/);
  });

  it("lists symptoms, check-ins, reports, readings and conditions, newest first", async () => {
    const events = await profileTimeline(w.demo, w.profiles.me, { kinds: PATIENT_TIMELINE_KINDS });
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has("symptom")).toBe(true);
    expect(kinds.has("check_in")).toBe(true);
    expect(kinds.has("report")).toBe(true);
    expect(events.every((e) => PATIENT_TIMELINE_KINDS.includes(e.kind))).toBe(true);
    for (let i = 1; i < events.length; i++) expect(new Date(events[i - 1]!.at).getTime()).toBeGreaterThanOrEqual(new Date(events[i]!.at).getTime());
  });
});
