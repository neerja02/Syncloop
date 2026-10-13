import { beforeAll, describe, expect, it } from "vitest";
import { LocalClinicalTerminologyProvider } from "@/lib/integrations/terminology/clinical";
import { evaluateTriage } from "@/lib/clinical/triage";
import { loadClinicalRules } from "@/lib/clinical/rules-repo";
import { routeMessage } from "@/lib/ai/agents/router";
import { createConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import type { ClinicalRule } from "@/lib/clinical/rules";
import { createWorld, type TestWorld } from "./helpers";

const term = new LocalClinicalTerminologyProvider();
let w: TestWorld;
let rules: ClinicalRule[];
beforeAll(async () => {
  w = await createWorld();
  rules = await loadClinicalRules(true);
});
const triage = async (t: string, m: { type: string; severity: "LOW" | "MODERATE" | "HIGH" | "EMERGENCY" }[] = []) => evaluateTriage(await term.extractConcepts(t), rules, m);

describe("triage / safety engine", () => {
  it("flags chest pain with sweating as an emergency", async () => {
    expect((await triage("I have chest pain and I'm sweating a lot")).level).toBe("EMERGENCY");
  });
  it("flags possible stroke signs", async () => {
    expect((await triage("Dad's face is drooping and his speech is slurred")).level).toBe("EMERGENCY");
  });
  it("treats self-harm as a crisis emergency", async () => {
    const r = await triage("I want to end my life");
    expect(r.level).toBe("EMERGENCY");
    expect(r.crisis).toBe(true);
  });
  it("does not match negated symptoms", async () => {
    expect((await triage("I have a cough but no chest pain and no breathing problems")).level).not.toBe("EMERGENCY");
  });
  it("chest pain alone is HIGH, not silently ignored", async () => {
    expect((await triage("I have some chest pain")).level).toBe("HIGH");
  });
  it("very high blood pressure plus symptoms is an emergency", async () => {
    expect((await triage("I have a bad headache", [{ type: "blood_pressure", severity: "HIGH" }])).level).toBe("EMERGENCY");
    expect((await triage("I have a bad headache", [{ type: "blood_pressure", severity: "MODERATE" }])).level).not.toBe("EMERGENCY");
  });
  it("routes ordinary messages to the right agent", () => {
    const r = (t: string) => routeMessage(t, [], {}).intent;
    expect(r("My blood pressure is 150/95")).toBe("measurements");
    expect(r("Can I take ibuprofen with my tablets?")).toBe("medicine");
    expect(r("Analyse this blood report")).toBe("reports");
    expect(r("Can I exercise today?")).toBe("exercise");
    expect(r("Tired")).toBe("check_in");
  });
  it("an emergency interrupts the normal conversation with verified numbers", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const turn = await handleUserMessage(w.demo, conv, "Crushing chest pain and I can't breathe properly");
    expect(turn.assistantMessage.urgency).toBe("EMERGENCY");
    const card = turn.assistantMessage.cards.find((c) => c.type === "emergency") as { emergencyNumber: string; ambulanceNumber: string } | undefined;
    expect(card?.emergencyNumber).toBe("112");
    expect(card?.ambulanceNumber).toBe("108");
  });
});
