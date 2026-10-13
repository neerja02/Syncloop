import { z } from "zod";

export const INTENTS = [
  "symptoms",
  "illness",
  "medicine",
  "reports",
  "exercise",
  "nutrition",
  "sleep",
  "mental_wellbeing",
  "measurements",
  "appointments",
  "emergency",
  "general_health",
  "doctor_question",
  "check_in",
  "smalltalk",
] as const;
export type Intent = (typeof INTENTS)[number];

export const urgencySchema = z.enum(["LOW", "MODERATE", "HIGH", "EMERGENCY"]);

/** Structured internal agent output. Never shown raw to users: it's rendered as text + UI cards. */
export const agentResponseSchema = z.object({
  profileId: z.string(),
  intent: z.enum(INTENTS),
  urgency: urgencySchema,
  summary: z.string(),
  clarifyingQuestions: z.array(z.string()).max(3),
  possibleExplanations: z.array(z.string()),
  recommendations: z.array(z.string()),
  selfCare: z.array(z.string()),
  redFlags: z.array(z.string()),
  doctorReviewRecommended: z.boolean(),
  doctorSpeciality: z.string().nullable(),
  suggestedActions: z.array(z.string()),
  medicalSources: z.array(z.string()),
  doctorSources: z.array(z.string()),
  recordUpdates: z.array(z.object({ kind: z.string(), description: z.string() })),
});
export type AgentResponse = z.infer<typeof agentResponseSchema>;

export const routerOutputSchema = z.object({
  intent: z.enum(INTENTS),
  secondaryIntents: z.array(z.enum(INTENTS)).max(3),
  confidence: z.number().min(0).max(1),
});
export type RouterOutput = z.infer<typeof routerOutputSchema>;

export type ActionKind = "link" | "send_review" | "upload_report" | "add_reading" | "book_appointment" | "save_record" | "quick_reply" | "call" | "share_summary" | "find_doctor" | "call_my_doctor";

export interface CardAction {
  label: string;
  kind: ActionKind;
  href?: string;
  value?: string;
  variant?: "primary" | "secondary" | "danger";
}

interface BaseCard {
  id: string;
}

export interface MeasurementResultCard extends BaseCard {
  type: "measurement_result";
  measurementType: "blood_glucose" | "blood_pressure";
  value: number;
  secondaryValue?: number | null;
  unit: string;
  contextLabel: string;
  statusLabel: string;
  severity: "LOW" | "MODERATE" | "HIGH" | "EMERGENCY";
  rule: { key: string; version: number; source: string } | null;
  trend: { points: { t: string; v: number; v2?: number | null }[]; summary: string };
  sections: { meaning: string; whatYouCanDo: string[]; symptomsToWatch: string[]; whenToContact: string };
  doctorGuidance: { text: string; source: string }[];
  actions: CardAction[];
}

export interface RecordProposalCard extends BaseCard {
  type: "record_proposal";
  kind: "measurement" | "medication" | "condition" | "allergy" | "symptom";
  profileId: string;
  profileName: string;
  label: string;
  payload: Record<string, unknown>;
  status: "pending" | "saved" | "dismissed";
}

export interface EmergencyCard extends BaseCard {
  type: "emergency";
  /** "emergency" = call now; "urgent" = be seen today. Defaults to emergency for older messages. */
  level?: "emergency" | "urgent";
  /** "vet" for animals: no human emergency numbers, point to emergency veterinary care instead. */
  audience?: "human" | "vet";
  title: string;
  message: string;
  reasons: string[];
  countryName: string;
  emergencyNumber: string;
  ambulanceNumber?: string | null;
  crisisLine?: { label: string; number: string } | null;
  emergencyContact: { name: string; phone: string } | null;
  profileId: string;
  profileName: string;
}

export interface ProfileSwitchCard extends BaseCard {
  type: "profile_switch";
  profileId: string;
  profileName: string;
  currentProfileName: string;
  question: string;
  originalMessage: string;
  status: "pending" | "switched" | "kept";
}

export interface MedicationConfirmCard extends BaseCard {
  type: "medication_confirm";
  original: string;
  suggestion: string;
  confidence: number;
  alternatives: string[];
  status: "pending" | "confirmed" | "manual" | "rejected";
  chosen?: string;
}

export interface DoctorGuidanceCard extends BaseCard {
  type: "doctor_guidance";
  doctorName: string;
  items: { kind: "instruction" | "knowledge" | "note"; title: string; text: string; documentId?: string; version?: number; date?: string }[];
}

export interface SourcesCard extends BaseCard {
  type: "sources";
  answerId: string;
  items: { kind: "doctor_instruction" | "doctor_knowledge" | "patient_record" | "clinical_rule" | "reference" | "general"; label: string }[];
}

export interface QuickRepliesCard extends BaseCard {
  type: "quick_replies";
  options: { label: string; value: string }[];
}

export interface ActionsCard extends BaseCard {
  type: "actions";
  actions: CardAction[];
}

export interface DoctorReplyCard {
  type: "doctor_reply";
  id?: string;
  reviewId: string;
  doctorName: string;
  action: string;
}

export interface ReportSummaryCard extends BaseCard {
  type: "report_summary";
  reportId: string;
  title: string;
  status: string;
  date: string | null;
  highlights: { name: string; value: number | null; valueText: string | null; unit: string | null; flag: string | null; status: string; previous?: number | null }[];
}

export interface TrendCard extends BaseCard {
  type: "trend";
  measurementType: string;
  label: string;
  unit: string;
  points: { t: string; v: number; v2?: number | null }[];
  summary: string;
}

export interface InfoCard extends BaseCard {
  type: "info";
  tone: "info" | "warning" | "success";
  title: string;
  body: string;
}

export interface MedicationInfoCard extends BaseCard {
  type: "medication_info";
  name: string;
  onRecord: { strength: string | null; frequency: string | null; instructions: string | null; prescribingDoctor: string | null; reason: string | null } | null;
  cautions: string[];
}

/** How a guided question is answered inside the conversation. */
export type QuestionStyle = "chips" | "symptoms" | "body" | "duration" | "scale" | "yesno" | "multi" | "number" | "upload" | "location";

export interface QuestionOption {
  label: string;
  value: string;
  /** Shown as the user's chat bubble when chosen (defaults to label). */
  reply?: string;
  hint?: string;
  /** In multi-select: choosing this clears the others (e.g. "None of these"). */
  exclusive?: boolean;
}

/** An interactive question rendered inside the chat (chips, scales, multi-select, number entry…). */
export interface QuestionCard extends BaseCard {
  type: "question";
  key: string;
  style: QuestionStyle;
  options: QuestionOption[];
  number?: { label: string; unit: string; placeholder?: string; min: number; max: number; step?: number; secondary?: { label: string; placeholder?: string; min: number; max: number } };
  /** Offer a small "type instead" text box. */
  allowText?: boolean;
  textPlaceholder?: string;
  status: "open" | "answered";
  answerLabel?: string;
}

export interface DoctorRecommendationCard extends BaseCard {
  type: "doctor_recommendation";
  speciality: string;
  reason: string;
  /** routine = in the next few days · soon = within a day or two · urgent = today */
  timing: "routine" | "soon" | "urgent";
  profileId: string;
  status: "open" | "dismissed";
}

export interface DoctorResultsCard extends BaseCard {
  type: "doctor_results";
  speciality: string;
  locationLabel: string;
  isDemo: boolean;
  mapsUrl: string;
  results: { id: string; name: string; speciality: string | null; clinic: string | null; address: string | null; distanceKm: number | null; phone: string | null; availability: string | null; consultationTypes: string[]; source: string }[];
}

/** The one care level every assessment ends with. */
export type CareLevelKey = "emergency" | "same_day" | "clinician" | "monitor";

export interface CareLevelCard extends BaseCard {
  type: "care_level";
  level: CareLevelKey;
  /** "vet" changes the wording to veterinary care. */
  audience: "human" | "vet";
}

export type ChatCard =
  | CareLevelCard
  | QuestionCard
  | DoctorRecommendationCard
  | DoctorResultsCard
  | MeasurementResultCard
  | RecordProposalCard
  | EmergencyCard
  | ProfileSwitchCard
  | MedicationConfirmCard
  | DoctorGuidanceCard
  | SourcesCard
  | QuickRepliesCard
  | ActionsCard
  | DoctorReplyCard
  | ReportSummaryCard
  | TrendCard
  | InfoCard
  | MedicationInfoCard;
