import { describe, expect, it } from "vitest";
import { agentResponseSchema, routerOutputSchema } from "@/lib/ai/types";
import { composeReply, numbersPreserved } from "@/lib/ai/services/composer";
import { baseResponse } from "@/lib/ai/agents/context";
import type { AIProvider } from "@/lib/ai/providers";
import type { Profile } from "@/types/domain";

const valid = baseResponse({ profile: { id: "p1" } as Profile & { age: number | null }, intent: "symptoms" }, { summary: "Headache", urgency: "MODERATE" });

describe("AI structured output validation", () => {
  it("accepts a well-formed agent response", () => {
    expect(agentResponseSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects malformed output (unknown urgency, missing fields, too many questions)", () => {
    expect(agentResponseSchema.safeParse({ ...valid, urgency: "CRITICAL" }).success).toBe(false);
    const { summary: _s, ...missing } = valid;
    expect(agentResponseSchema.safeParse(missing).success).toBe(false);
    expect(agentResponseSchema.safeParse({ ...valid, clarifyingQuestions: ["a", "b", "c", "d"] }).success).toBe(false);
  });
  it("validates router output", () => {
    expect(routerOutputSchema.safeParse({ intent: "medicine", secondaryIntents: [], confidence: 0.9 }).success).toBe(true);
    expect(routerOutputSchema.safeParse({ intent: "diagnose", secondaryIntents: [], confidence: 2 }).success).toBe(false);
  });
});

describe("composer numeric guard", () => {
  it("detects numbers that weren't in the source", () => {
    expect(numbersPreserved("Your reading of 184 is above target", "184 mg/dL above target")).toBe(true);
    expect(numbersPreserved("Take 1000 mg of metformin", "184 mg/dL above target")).toBe(false);
  });
  it("falls back to the deterministic draft if the LLM invents a number", async () => {
    const fake: AIProvider = { name: "fake", model: "x", isMock: false, supportsVision: false, chat: async () => "Your sugar is 184. Take 2 extra tablets of 500 mg.", structuredOutput: async () => { throw new Error("n/a"); } };
    const result = { agent: "Test", text: "184 mg/dL is above a common after-meal target. Drink water and take a short walk if you feel well.", cards: [], response: { ...valid, summary: "glucose 184" } };
    const out = await composeReply(fake, result, "user");
    expect(out.polished).toBe(false);
    expect(out.text).toBe(result.text);
  });
  it("never rewrites locked (emergency) text", async () => {
    const fake: AIProvider = { name: "fake", model: "x", isMock: false, supportsVision: false, chat: async () => "rewritten", structuredOutput: async () => { throw new Error("n/a"); } };
    const out = await composeReply(fake, { agent: "Safety", text: "Call emergency services (112) now. This is a long locked message for safety.", cards: [], lockText: true, response: valid }, "user");
    expect(out.text).toMatch(/112/);
  });
});
