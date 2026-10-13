import type { QuestionCard } from "../types";

export type GuidedFlow = "symptom" | "test_result" | "report" | "question" | "find_doctor";

export type Complaint = "pain" | "heart" | "fever" | "cough" | "breathing" | "stomach" | "headache" | "skin" | "eye" | "weakness" | "hair" | "hormones" | "fall" | "mood" | "ent" | "dental" | "urinary" | "sleep" | "pregnancy" | "other";

export type CareLevel = "self_care" | "routine" | "specialist" | "urgent" | "emergency";

/** Who the symptom check is about when that isn't simply the conversation's saved profile. */
export interface GuidedPatient {
  kind: "adult" | "child" | "baby" | "pet";
  label: string;
  /** False for "my baby" / "my pet" / "someone else" without a saved profile: nothing is saved to a record. */
  saved?: boolean;
  ageMonths?: number | null;
  ageYears?: number | null;
  species?: string | null;
}

/**
 * Structured state of one guided health chat. The engine never asks for something already recorded here
 * (or already in the profile), and every answer passes through red-flag screening before the next question.
 */
export interface GuidedState {
  flow: GuidedFlow;
  activeProfileId: string;
  patient?: GuidedPatient | null;
  complaint?: Complaint | null;
  /** chest · upper_abdomen · lower_abdomen · back · side · arm · leg · head · unsure */
  bodyArea?: string | null;
  side?: "left" | "right" | null;
  /** Sub-type within a complaint, e.g. vomiting / loose motions for stomach. */
  symptomType?: string | null;
  /** today · 1_3_days · 4_7_days · over_week · over_3_weeks … */
  onset?: string | null;
  severity?: "mild" | "moderate" | "severe" | null;
  characteristics: string[];
  associatedSymptoms: string[];
  redFlags: string[];
  trend?: "worse" | "same" | "better" | null;
  knownConditions: string[];
  relevantReports: { id: string; title: string; date: string | null }[];
  urgency?: CareLevel | null;
  recommendedNextStep?: string | null;
  /** Question keys already asked, and raw answers by key. */
  asked: string[];
  answers: Record<string, string>;
  /** The question currently waiting for an answer. */
  pending?: string | null;
  /** Free-text notes the user typed instead of tapping. */
  notes: string[];
  /** test_result flow */
  test?: string | null;
  /** question flow */
  topic?: string | null;
  /** Short name of what was assessed, for check-ins ("upper stomach pain"). */
  summaryTopic?: string | null;
  /** find_doctor flow */
  speciality?: string | null;
  done?: boolean;
}

/** A question definition produced by the engine; rendered as a QuestionCard. */
export interface QuestionDef extends Omit<QuestionCard, "id" | "type" | "status" | "answerLabel"> {
  text: string;
}

export interface StructuredAnswer {
  key: string;
  value: string;
  label?: string;
}

export function emptyState(flow: GuidedFlow, profileId: string): GuidedState {
  return { flow, activeProfileId: profileId, characteristics: [], associatedSymptoms: [], redFlags: [], knownConditions: [], relevantReports: [], asked: [], answers: {}, notes: [] };
}
