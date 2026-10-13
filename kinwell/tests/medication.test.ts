import { beforeAll, describe, expect, it, afterAll } from "vitest";
import { LocalMedicationTerminologyProvider } from "@/lib/integrations/terminology/medication";
import { saveMedication } from "@/lib/services/health-record";
import { decideConfidence } from "@/lib/config/confidence";
import { createConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import { count, createWorld, type TestWorld } from "./helpers";

// Some of these tests cover doctor-portal behaviour, which is switched off in the patient-only MVP.
beforeAll(() => {
  process.env.ENABLE_DOCTOR_PORTAL = "true";
});
afterAll(() => {
  delete process.env.ENABLE_DOCTOR_PORTAL;
});

const term = new LocalMedicationTerminologyProvider();
let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});

describe("medication normalisation", () => {
  it("suggests Metformin for 'metfornin' with less than full confidence", async () => {
    const n = await term.normalise("metfornin 500 mg tablet");
    expect(n.canonical_name).toBe("Metformin");
    expect(n.confidence).toBeLessThan(1);
    expect(decideConfidence("medication_name", n.confidence)).toBe("confirm");
    expect(n.strength).toBe("500 mg");
    expect(n.form).toBe("tablet");
  });
  it("maps brand names to the generic", async () => {
    const n = await term.normalise("Dolo 650");
    expect(n.canonical_name).toBe("Paracetamol");
    expect(n.brand_name).toBe("Dolo 650");
  });
  it("returns nothing for gibberish", async () => {
    expect((await term.normalise("xqzzv")).canonical_name).toBeNull();
  });
  it("never silently stores an uncertain medicine name", async () => {
    const before = await count(w.db, "select count(*) as n from medications where profile_id = $1", [w.profiles.dad]);
    const r = await saveMedication(w.demo, { profileId: w.profiles.dad, name: "metfornin" });
    expect(r.status).toBe("needs_confirmation");
    expect(r.suggestion?.canonical).toBe("Metformin");
    expect(await count(w.db, "select count(*) as n from medications where profile_id = $1", [w.profiles.dad])).toBe(before);
    const ok = await saveMedication(w.demo, { profileId: w.profiles.dad, name: "Metformin", nameConfirmed: true, originalText: "metfornin" });
    expect(ok.status).toBe("saved");
    expect(ok.medication?.original_text).toBe("metfornin");
  });
  it("asks 'Did you mean…?' in chat before giving medicine information", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const turn = await handleUserMessage(w.demo, conv, "Can I take metfornin after dinner?");
    const card = turn.assistantMessage.cards.find((c) => c.type === "medication_confirm") as { suggestion: string } | undefined;
    expect(card?.suggestion).toBe("Metformin");
  });
  it("applies the doctor's patient-specific restriction over general information", async () => {
    const conv = await createConversation(w.demo, w.profiles.mom);
    const turn = await handleUserMessage(w.demo, conv, "Can she take ibuprofen for her headache?");
    expect(turn.assistantMessage.content).toMatch(/don't give Mom Ibuprofen/i);
    expect(turn.assistantMessage.content).toMatch(/Avoid ibuprofen/);
  });
});
