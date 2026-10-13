import { beforeAll, describe, expect, it, afterAll } from "vitest";
import { createReview, actOnReview, listDoctorReviews, listFamilyReviews } from "@/lib/services/reviews";
import { createConversation, getConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import { listDoctorNotes } from "@/lib/services/health-record";
import { ForbiddenError } from "@/lib/security/access";
import { count, createWorld, type TestWorld } from "./helpers";

// These tests cover the doctor portal, which is switched off in the patient-only MVP.
beforeAll(() => {
  process.env.ENABLE_DOCTOR_PORTAL = "true";
});
afterAll(() => {
  delete process.env.ENABLE_DOCTOR_PORTAL;
});

let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});

describe("doctor review workflow", () => {
  it("patient sends a case → doctor receives it → responds → patient sees it in chat and record", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const turn = await handleUserMessage(w.demo, conv, "My fasting sugar was 160 this morning");
    const reviewId = await createReview(w.demo, { profileId: w.profiles.me, conversationId: conv, messageId: turn.assistantMessage.id, question: "Should I be worried about 160 fasting?", priority: "soon" });

    const inbox = await listDoctorReviews(w.doctor);
    const r = inbox.find((x) => x.id === reviewId)!;
    expect(r).toBeTruthy();
    expect(r.ai_response).toBe(turn.assistantMessage.content);
    expect(r.measurements.length).toBeGreaterThan(0);
    expect(await count(w.db, "select count(*) as n from notifications where kind = 'review_request' and user_id = $1", [w.doctor.id])).toBeGreaterThan(0);

    await actOnReview(w.doctor, { reviewId, action: "respond", response: "Please repeat fasting tomorrow and continue metformin. If above 180 twice, message me." });

    const fam = await listFamilyReviews(w.demo, w.demo.familyId, w.profiles.me);
    expect(fam.find((x) => x.id === reviewId)?.status).toBe("responded");
    const { messages } = await getConversation(w.demo, conv);
    const reply = messages.at(-1)!;
    expect(reply.role).toBe("doctor");
    expect(reply.content).toMatch(/repeat fasting tomorrow/);
    const notes = await listDoctorNotes(w.demo, w.profiles.me);
    expect(notes.some((n) => /repeat fasting tomorrow/.test(n.note))).toBe(true);
    expect(await count(w.db, "select count(*) as n from notifications where kind = 'doctor_response' and user_id = $1", [w.demo.id])).toBeGreaterThan(0);
  });
  it("the doctor's response becomes part of the patient's medical context for later answers", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const turn = await handleUserMessage(w.demo, conv, "What did my doctor say about my fasting sugar?");
    const guidance = turn.assistantMessage.cards.find((c) => c.type === "doctor_guidance") as { items: { text: string }[] } | undefined;
    expect(guidance?.items.some((i) => /repeat fasting tomorrow|fasting sugar 3 times/i.test(i.text))).toBe(true);
  });
  it("an unassigned doctor cannot act on the case", async () => {
    const reviewId = await createReview(w.demo, { profileId: w.profiles.dad, question: "Is my cholesterol ok?" });
    await expect(actOnReview(w.doctor2, { reviewId, action: "respond", response: "Hello" })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("families without a doctor get a clear message", async () => {
    await w.db.query("update doctor_family_assignments set status = 'ended' where family_id = $1", [w.rivera.familyId]);
    await expect(createReview(w.rivera, { profileId: w.profiles.carlos, question: "Is my asthma ok?" })).rejects.toThrow(/doesn't have an assigned doctor/);
  });
  it("a doctor who stops accepting reviews is shown as unavailable", async () => {
    await w.db.query("update doctors set accepting_reviews = false where id = $1", [w.doctor.doctorId]);
    await expect(createReview(w.demo, { profileId: w.profiles.dad, question: "Quick question please" })).rejects.toThrow(/unavailable for direct review/);
    await w.db.query("update doctors set accepting_reviews = true where id = $1", [w.doctor.doctorId]);
  });
});
