import { describe, expect, it } from "vitest";
import { measurementInputSchema } from "@/lib/validation/health";

const pid = "11111111-1111-4111-8111-111111111111";

describe("health measurement validation", () => {
  it("accepts a valid glucose reading with context", () => {
    const m = measurementInputSchema.parse({ profileId: pid, measurementType: "blood_glucose", value: "184", context: "after_meal", minutesAfterMeal: 120 });
    expect(m.value).toBe(184);
    expect(m.unit).toBe("mg/dL");
  });
  it("requires glucose context (fasting / after meal …)", () => {
    expect(measurementInputSchema.safeParse({ profileId: pid, measurementType: "blood_glucose", value: 120 }).success).toBe(false);
  });
  it("converts mmol/L to mg/dL", () => {
    const m = measurementInputSchema.parse({ profileId: pid, measurementType: "blood_glucose", value: 7, unit: "mmol/L", context: "fasting" });
    expect(m.value).toBe(126);
    expect(m.unit).toBe("mg/dL");
  });
  it("rejects implausible values instead of storing typos", () => {
    expect(measurementInputSchema.safeParse({ profileId: pid, measurementType: "blood_glucose", value: 1840, context: "random" }).success).toBe(false);
    expect(measurementInputSchema.safeParse({ profileId: pid, measurementType: "spo2", value: 140 }).success).toBe(false);
  });
  it("requires both blood pressure values in the right order", () => {
    expect(measurementInputSchema.safeParse({ profileId: pid, measurementType: "blood_pressure", value: 130 }).success).toBe(false);
    expect(measurementInputSchema.safeParse({ profileId: pid, measurementType: "blood_pressure", value: 80, secondaryValue: 130 }).success).toBe(false);
    expect(measurementInputSchema.safeParse({ profileId: pid, measurementType: "blood_pressure", value: 130, secondaryValue: 85 }).success).toBe(true);
  });
  it("rejects future timestamps", () => {
    expect(measurementInputSchema.safeParse({ profileId: pid, measurementType: "heart_rate", value: 70, measuredAt: new Date(Date.now() + 86400000) }).success).toBe(false);
  });
});
