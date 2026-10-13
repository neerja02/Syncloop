import { z } from "zod";

export const uuid = z.string().uuid();

export const MEASUREMENT_TYPES = ["blood_glucose", "hba1c", "blood_pressure", "heart_rate", "temperature", "weight", "height", "bmi", "spo2", "sleep_duration", "steps"] as const;
export const GLUCOSE_CONTEXTS = ["fasting", "before_meal", "after_meal", "random", "bedtime"] as const;

/** Physiologically plausible bounds. Values outside are rejected as likely typos rather than stored. */
export const MEASUREMENT_SPEC: Record<(typeof MEASUREMENT_TYPES)[number], { label: string; unit: string; min: number; max: number; secondary?: { label: string; min: number; max: number }; decimals: number }> = {
  blood_glucose: { label: "Blood glucose", unit: "mg/dL", min: 10, max: 900, decimals: 0 },
  hba1c: { label: "HbA1c", unit: "%", min: 3, max: 20, decimals: 1 },
  blood_pressure: { label: "Blood pressure", unit: "mmHg", min: 50, max: 300, secondary: { label: "Diastolic", min: 25, max: 200 }, decimals: 0 },
  heart_rate: { label: "Heart rate", unit: "bpm", min: 20, max: 250, decimals: 0 },
  temperature: { label: "Temperature", unit: "°C", min: 30, max: 45, decimals: 1 },
  weight: { label: "Weight", unit: "kg", min: 0.5, max: 400, decimals: 1 },
  height: { label: "Height", unit: "cm", min: 20, max: 260, decimals: 0 },
  bmi: { label: "BMI", unit: "kg/m²", min: 8, max: 90, decimals: 1 },
  spo2: { label: "Oxygen saturation", unit: "%", min: 50, max: 100, decimals: 0 },
  sleep_duration: { label: "Sleep", unit: "hours", min: 0, max: 24, decimals: 1 },
  steps: { label: "Steps", unit: "steps", min: 0, max: 100000, decimals: 0 },
};

export const measurementInputSchema = z
  .object({
    profileId: uuid,
    measurementType: z.enum(MEASUREMENT_TYPES),
    value: z.coerce.number().finite(),
    secondaryValue: z.coerce.number().finite().optional().nullable(),
    unit: z.string().max(20).optional(),
    context: z.enum([...GLUCOSE_CONTEXTS, "resting", "active", "morning", "evening"]).optional().nullable(),
    minutesAfterMeal: z.coerce.number().int().min(0).max(600).optional().nullable(),
    measuredAt: z.coerce.date().optional(),
    notes: z.string().max(500).optional().nullable(),
    source: z.enum(["manual", "chat", "report", "device", "doctor"]).default("manual"),
  })
  .superRefine((m, ctx) => {
    const spec = MEASUREMENT_SPEC[m.measurementType];
    let value = m.value;
    if (m.measurementType === "blood_glucose" && m.unit === "mmol/L") value = m.value * 18.0182;
    if (value < spec.min || value > spec.max) {
      ctx.addIssue({ code: "custom", path: ["value"], message: `${spec.label} should be between ${spec.min} and ${spec.max} ${spec.unit}. Please check the reading.` });
    }
    if (m.measurementType === "blood_pressure") {
      if (m.secondaryValue == null) ctx.addIssue({ code: "custom", path: ["secondaryValue"], message: "Enter both systolic and diastolic values." });
      else if (m.secondaryValue < spec.secondary!.min || m.secondaryValue > spec.secondary!.max) ctx.addIssue({ code: "custom", path: ["secondaryValue"], message: `Diastolic should be between ${spec.secondary!.min} and ${spec.secondary!.max} mmHg.` });
      else if (m.secondaryValue >= m.value) ctx.addIssue({ code: "custom", path: ["secondaryValue"], message: "Diastolic is usually lower than systolic — please check the order." });
    }
    if (m.measurementType === "blood_glucose" && !m.context) {
      ctx.addIssue({ code: "custom", path: ["context"], message: "Choose when the reading was taken (fasting, before meal, after meal, random or bedtime)." });
    }
    if (m.measuredAt && m.measuredAt.getTime() > Date.now() + 5 * 60000) {
      ctx.addIssue({ code: "custom", path: ["measuredAt"], message: "The reading time can't be in the future." });
    }
  })
  .transform((m) => {
    if (m.measurementType === "blood_glucose" && m.unit === "mmol/L") return { ...m, value: Math.round(m.value * 18.0182), unit: "mg/dL" };
    return { ...m, unit: MEASUREMENT_SPEC[m.measurementType].unit };
  });
export type MeasurementInput = z.infer<typeof measurementInputSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date");

export const RELATIONSHIPS = ["self", "mother", "father", "spouse", "child", "sibling", "grandparent", "other", "pet"] as const;
export const SPECIES = ["dog", "cat", "rabbit", "bird", "other"] as const;

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(60),
  relationship: z.enum(RELATIONSHIPS),
  dateOfBirth: optionalDate.refine((v) => v === null || new Date(v) <= new Date(), "Date of birth can't be in the future"),
  sex: z.enum(["female", "male", "intersex", "prefer_not_to_say"]).optional().nullable().or(z.literal("").transform(() => null)),
  heightCm: z.coerce.number().min(20).max(260).optional().nullable().or(z.literal("").transform(() => null)),
  weightKg: z.coerce.number().min(0.5).max(400).optional().nullable().or(z.literal("").transform(() => null)),
  bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]).optional().nullable().or(z.literal("").transform(() => null)),
  pregnancyStatus: z.enum(["not_pregnant", "pregnant", "unknown"]).optional().nullable().or(z.literal("").transform(() => null)),
  familyHistory: optionalText(1000),
  previousSurgeries: optionalText(1000),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  lifestyle: z
    .object({
      activityLevel: z.enum(["low", "moderate", "high"]).optional(),
      diet: z.string().max(100).optional(),
      smoking: z.enum(["never", "former", "current"]).optional(),
      alcohol: z.enum(["none", "occasional", "regular"]).optional(),
      sleepGoalHours: z.coerce.number().min(3).max(14).optional(),
      // Children: gestational age at birth, birth weight and feeding. Children and pets: vaccinations.
      bornWeeks: z.coerce.number().int().min(22).max(44).optional(),
      birthWeightKg: z.coerce.number().min(0.3).max(7).optional(),
      feeding: z.enum(["breast", "formula", "mixed", "solids"]).optional(),
      vaccinations: z.string().max(200).optional(),
    })
    .partial()
    .optional(),
  insuranceProvider: optionalText(100),
  insurancePolicy: optionalText(60),
  species: z.enum(SPECIES).optional().nullable().or(z.literal("").transform(() => null)),
  breed: optionalText(60),
  neutered: z.union([z.boolean(), z.enum(["yes", "no", ""]).transform((v) => (v === "" ? null : v === "yes"))]).optional().nullable(),
}).refine((v) => v.relationship !== "pet" || !!v.species, { message: "Choose what kind of animal this is", path: ["species"] });
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const medicationInputSchema = z.object({
  profileId: uuid,
  name: z.string().trim().min(1, "Medicine name is required").max(120),
  genericName: optionalText(120),
  brandName: optionalText(120),
  strength: optionalText(40),
  form: optionalText(40),
  frequency: optionalText(80),
  duration: optionalText(80),
  reason: optionalText(200),
  instructions: optionalText(500),
  prescribingDoctor: optionalText(100),
  startDate: optionalDate,
  endDate: optionalDate,
  reminderTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(6).default([]),
  /** True only after the user confirmed an uncertain terminology match (or typed the name exactly). */
  nameConfirmed: z.coerce.boolean().default(false),
  originalText: optionalText(200),
  externalId: optionalText(60),
  terminologyConfidence: z.coerce.number().min(0).max(1).optional().nullable(),
});
export type MedicationInput = z.infer<typeof medicationInputSchema>;

export const conditionInputSchema = z.object({
  profileId: uuid,
  name: z.string().trim().min(1).max(120),
  status: z.enum(["active", "resolved", "monitoring"]).default("active"),
  diagnosedOn: optionalDate,
  notes: optionalText(500),
});

export const allergyInputSchema = z.object({
  profileId: uuid,
  substance: z.string().trim().min(1).max(120),
  reaction: optionalText(200),
  severity: z.enum(["mild", "moderate", "severe", "unknown"]).default("unknown"),
});

export const goalInputSchema = z.object({
  profileId: uuid,
  title: z.string().trim().min(2).max(120),
  category: z.enum(["sleep", "activity", "nutrition", "measurement", "preventive", "wellbeing", "general"]),
  targetValue: z.coerce.number().optional().nullable().or(z.literal("").transform(() => null)),
  unit: optionalText(20),
  dueDate: optionalDate,
});

export const appointmentInputSchema = z.object({
  profileId: uuid,
  doctorId: uuid.optional().nullable().or(z.literal("").transform(() => null)),
  providerId: uuid.optional().nullable().or(z.literal("").transform(() => null)),
  providerName: optionalText(120),
  speciality: optionalText(80),
  startsAt: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60 * 60000, "Choose a future date and time"),
  location: optionalText(200),
  appointmentType: z.enum(["in_person", "teleconsultation", "phone"]).default("in_person"),
  notes: optionalText(1000),
  mode: z.enum(["request", "book"]).default("request"),
});

export const doctorInstructionSchema = z.object({
  profileId: uuid,
  instructionType: z.enum(["avoid_medicine", "dose_restriction", "monitoring", "emergency_threshold", "diet_restriction", "activity_restriction", "treatment_protocol", "general"]),
  instruction: z.string().trim().min(5).max(2000),
  reason: optionalText(1000),
  topics: z.array(z.string().max(40)).max(10).default([]),
});

export const ALLOWED_REPORT_MIME = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "text/plain"] as const;
export const MAX_REPORT_BYTES = 15 * 1024 * 1024;

export const fileMetaSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string(),
  size: z.number().int().positive().max(MAX_REPORT_BYTES, "Files must be 15 MB or smaller"),
});

export function sniffMime(buf: Buffer, declared: string, filename: string): string | null {
  const head = buf.subarray(0, 12);
  if (head.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.subarray(4, 8).toString("latin1") === "ftyp" && /heic|heix|mif1|msf1|heif/.test(head.subarray(8, 12).toString("latin1"))) return "image/heic";
  if (head[0] === 0x50 && head[1] === 0x4b && /\.docx$/i.test(filename)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if ((declared === "text/plain" || /\.txt$/i.test(filename)) && !buf.subarray(0, 2048).includes(0)) return "text/plain";
  return null;
}
