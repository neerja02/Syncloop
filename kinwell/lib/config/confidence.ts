/**
 * Central confidence thresholds. No component should hard-code its own threshold.
 * Clinically important fields (medication names, dosage, lab values, measurements, dates) use stricter limits.
 */
export type ConfidenceField = "medication_name" | "dosage" | "lab_value" | "measurement" | "date" | "document_type" | "text" | "profile_detection";

export const CONFIDENCE_THRESHOLDS: Record<ConfidenceField, { autoAccept: number; minimumUsable: number }> = {
  // >= autoAccept: stored as confirmed. Between minimumUsable and autoAccept: user must confirm. < minimumUsable: treated as unreadable.
  medication_name: { autoAccept: 0.97, minimumUsable: 0.6 },
  dosage: { autoAccept: 0.97, minimumUsable: 0.75 },
  lab_value: { autoAccept: 0.95, minimumUsable: 0.7 },
  measurement: { autoAccept: 0.95, minimumUsable: 0.7 },
  date: { autoAccept: 0.9, minimumUsable: 0.6 },
  document_type: { autoAccept: 0.8, minimumUsable: 0.5 },
  text: { autoAccept: 0.8, minimumUsable: 0.5 },
  profile_detection: { autoAccept: 0.9, minimumUsable: 0.5 },
};

export type ConfidenceDecision = "accept" | "confirm" | "reject";

export function decideConfidence(field: ConfidenceField, confidence: number): ConfidenceDecision {
  const t = CONFIDENCE_THRESHOLDS[field];
  if (confidence >= t.autoAccept) return "accept";
  if (confidence >= t.minimumUsable) return "confirm";
  return "reject";
}
