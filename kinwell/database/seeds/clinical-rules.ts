/**
 * DEMO clinical rule set. Values are transcribed from widely published guidance for demonstration only and are
 * marked "pending clinical review". A clinician must review, adapt to jurisdiction and approve before production.
 */
type Severity = "LOW" | "MODERATE" | "HIGH" | "EMERGENCY";
export interface SeedRule {
  rule_key: string;
  rule_kind: "measurement_threshold" | "triage_pattern";
  condition?: string;
  measurement_type?: string;
  context?: string | null;
  diagnosis_status?: "any" | "diagnosed" | "not_diagnosed";
  age_min?: number;
  age_max?: number;
  unit?: string;
  min_value?: number | null;
  max_value?: number | null;
  secondary_min?: number | null;
  secondary_max?: number | null;
  pattern?: Record<string, unknown>;
  severity: Severity;
  status_label: string;
  recommended_action: string;
  source: string;
  priority?: number;
}

const ADA = "ADA Standards of Care (demo transcription — pending clinical review)";
const AHA = "ACC/AHA 2017 BP categories (demo transcription — pending clinical review)";
const TRIAGE = "Kinwell triage patterns v1 (demo — pending clinical review)";

const glucose = (key: string, context: string | null, diag: SeedRule["diagnosis_status"], min: number | null, max: number | null, severity: Severity, label: string, action: string): SeedRule => ({
  rule_key: `glucose.${key}`,
  rule_kind: "measurement_threshold",
  condition: "blood_glucose",
  measurement_type: "blood_glucose",
  context,
  diagnosis_status: diag,
  unit: "mg/dL",
  min_value: min,
  max_value: max,
  severity,
  status_label: label,
  recommended_action: action,
  source: ADA,
});

export const SEED_RULES: SeedRule[] = [
  // Low glucose — any context
  glucose("very_low", null, "any", null, 54, "HIGH", "Very low", "Treat a low straight away using your low-sugar plan and recheck in 15 minutes. If confused, drowsy or unable to swallow, get emergency help."),
  glucose("low", null, "any", 54, 70, "MODERATE", "Low", "Have fast-acting sugar if you take diabetes medicine and recheck in 15 minutes. Tell your doctor about repeated lows."),
  // Fasting / before meal — not diagnosed
  glucose("fasting.typical", "fasting", "not_diagnosed", 70, 100, "LOW", "Within the typical fasting range", "No action needed. Keep logging if your doctor asked you to."),
  glucose("fasting.elevated", "fasting", "not_diagnosed", 100, 126, "MODERATE", "Above the typical fasting range", "Mention this to your doctor; a repeat test or HbA1c may be useful."),
  glucose("fasting.high", "fasting", "not_diagnosed", 126, 250, "MODERATE", "High for a fasting reading", "Please arrange to discuss this with your doctor soon — a single high reading needs confirming."),
  glucose("fasting.very_high", "fasting", "any", 250, null, "HIGH", "Very high", "Contact your doctor today. Seek urgent care if you have vomiting, confusion or trouble breathing."),
  // Fasting — diagnosed diabetes (common targets 80–130)
  glucose("fasting.dm.target", "fasting", "diagnosed", 70, 131, "LOW", "Within a common target range for diabetes", "Keep going with your current plan."),
  glucose("fasting.dm.above", "fasting", "diagnosed", 131, 250, "MODERATE", "Above a common target range for diabetes", "If fasting readings stay above target for several days, share them with your doctor."),
  // After meal (about 1–2 h) — not diagnosed
  glucose("post.typical", "after_meal", "not_diagnosed", 70, 140, "LOW", "Within the typical after-meal range", "No action needed."),
  glucose("post.elevated", "after_meal", "not_diagnosed", 140, 200, "MODERATE", "Above the typical after-meal range", "Mention this to your doctor, especially if it happens again."),
  glucose("post.high", "after_meal", "not_diagnosed", 200, 300, "MODERATE", "High after a meal", "Please discuss this with your doctor soon — it may need testing for diabetes."),
  glucose("post.very_high", "after_meal", "any", 300, null, "HIGH", "Very high", "Contact your doctor today. Seek urgent care if you have vomiting, confusion or trouble breathing."),
  // After meal — diagnosed (common target < 180)
  glucose("post.dm.target", "after_meal", "diagnosed", 70, 180, "LOW", "Within a common after-meal target for diabetes", "Keep going with your current plan."),
  glucose("post.dm.above", "after_meal", "diagnosed", 180, 300, "MODERATE", "Above a common after-meal target for diabetes", "Note what you ate, stay hydrated, and share the pattern with your doctor if it repeats."),
  // Random / bedtime
  glucose("random.typical", "random", "any", 70, 140, "LOW", "Within a typical range", "No action needed."),
  glucose("random.elevated", "random", "any", 140, 200, "MODERATE", "Above the typical range", "Recheck at a set time (fasting or 2 hours after a meal) for a clearer picture."),
  glucose("random.high", "random", "any", 200, 300, "MODERATE", "High", "Discuss with your doctor soon, especially with thirst, frequent urination or tiredness."),
  glucose("random.very_high", "random", "any", 300, null, "HIGH", "Very high", "Contact your doctor today. Seek urgent care if you have vomiting, confusion or trouble breathing."),

  // Blood pressure (systolic OR diastolic band; most severe wins)
  { rule_key: "bp.low", rule_kind: "measurement_threshold", measurement_type: "blood_pressure", unit: "mmHg", min_value: null, max_value: 90, secondary_min: null, secondary_max: 60, severity: "MODERATE", status_label: "Lower than usual", recommended_action: "If you feel dizzy or faint, sit or lie down and tell your doctor.", source: AHA },
  { rule_key: "bp.normal", rule_kind: "measurement_threshold", measurement_type: "blood_pressure", unit: "mmHg", min_value: 90, max_value: 120, secondary_min: null, secondary_max: null, severity: "LOW", status_label: "Normal range", recommended_action: "No action needed.", source: AHA },
  { rule_key: "bp.elevated", rule_kind: "measurement_threshold", measurement_type: "blood_pressure", unit: "mmHg", min_value: 120, max_value: 130, secondary_min: null, secondary_max: null, severity: "LOW", status_label: "Elevated", recommended_action: "Keep an eye on it and focus on salt, activity and sleep.", source: AHA },
  { rule_key: "bp.stage1", rule_kind: "measurement_threshold", measurement_type: "blood_pressure", unit: "mmHg", min_value: 130, max_value: 140, secondary_min: 80, secondary_max: 90, severity: "MODERATE", status_label: "Stage 1 high blood pressure range", recommended_action: "Log readings for a week and share them with your doctor.", source: AHA },
  { rule_key: "bp.stage2", rule_kind: "measurement_threshold", measurement_type: "blood_pressure", unit: "mmHg", min_value: 140, max_value: 180, secondary_min: 90, secondary_max: 120, severity: "MODERATE", status_label: "Stage 2 high blood pressure range", recommended_action: "Contact your doctor to review your readings and treatment.", source: AHA },
  { rule_key: "bp.severe", rule_kind: "measurement_threshold", measurement_type: "blood_pressure", unit: "mmHg", min_value: 180, max_value: null, secondary_min: 120, secondary_max: null, severity: "HIGH", status_label: "Very high", recommended_action: "Rest 5 minutes and recheck. If still this high, contact your doctor today. With chest pain, breathlessness, weakness, vision or speech changes, call emergency services.", source: AHA },

  // HbA1c
  { rule_key: "hba1c.typical", rule_kind: "measurement_threshold", measurement_type: "hba1c", diagnosis_status: "not_diagnosed", unit: "%", min_value: null, max_value: 5.7, severity: "LOW", status_label: "Typical range", recommended_action: "No action needed.", source: ADA },
  { rule_key: "hba1c.prediabetes", rule_kind: "measurement_threshold", measurement_type: "hba1c", diagnosis_status: "not_diagnosed", unit: "%", min_value: 5.7, max_value: 6.5, severity: "MODERATE", status_label: "Prediabetes range", recommended_action: "Discuss lifestyle steps and follow-up testing with your doctor.", source: ADA },
  { rule_key: "hba1c.diabetes", rule_kind: "measurement_threshold", measurement_type: "hba1c", diagnosis_status: "not_diagnosed", unit: "%", min_value: 6.5, max_value: null, severity: "MODERATE", status_label: "Diabetes range", recommended_action: "Please discuss this result with your doctor.", source: ADA },
  { rule_key: "hba1c.dm.target", rule_kind: "measurement_threshold", measurement_type: "hba1c", diagnosis_status: "diagnosed", unit: "%", min_value: null, max_value: 7, severity: "LOW", status_label: "Within a common target", recommended_action: "Keep going with your current plan.", source: ADA },
  { rule_key: "hba1c.dm.above", rule_kind: "measurement_threshold", measurement_type: "hba1c", diagnosis_status: "diagnosed", unit: "%", min_value: 7, max_value: null, severity: "MODERATE", status_label: "Above a common target", recommended_action: "Ask your doctor what target is right for you.", source: ADA },

  // SpO2, heart rate, temperature
  { rule_key: "spo2.normal", rule_kind: "measurement_threshold", measurement_type: "spo2", unit: "%", min_value: 95, max_value: null, severity: "LOW", status_label: "Normal range", recommended_action: "No action needed.", source: TRIAGE },
  { rule_key: "spo2.borderline", rule_kind: "measurement_threshold", measurement_type: "spo2", unit: "%", min_value: 92, max_value: 95, severity: "MODERATE", status_label: "Slightly low", recommended_action: "Recheck at rest. Contact your doctor if it stays low or you feel breathless.", source: TRIAGE },
  { rule_key: "spo2.low", rule_kind: "measurement_threshold", measurement_type: "spo2", unit: "%", min_value: null, max_value: 92, severity: "HIGH", status_label: "Low", recommended_action: "Seek prompt medical advice. Call emergency services if breathless or lips look blue.", source: TRIAGE },
  { rule_key: "hr.resting.normal", rule_kind: "measurement_threshold", measurement_type: "heart_rate", unit: "bpm", min_value: 50, max_value: 101, severity: "LOW", status_label: "Typical resting range", recommended_action: "No action needed.", source: TRIAGE },
  { rule_key: "hr.resting.high", rule_kind: "measurement_threshold", measurement_type: "heart_rate", unit: "bpm", min_value: 101, max_value: null, severity: "MODERATE", status_label: "Faster than typical at rest", recommended_action: "Rest and recheck. Contact your doctor if it stays high or you feel unwell.", source: TRIAGE },
  { rule_key: "hr.resting.low", rule_kind: "measurement_threshold", measurement_type: "heart_rate", unit: "bpm", min_value: null, max_value: 50, severity: "MODERATE", status_label: "Slower than typical at rest", recommended_action: "This can be normal for fit people; contact your doctor if dizzy or faint.", source: TRIAGE },
  { rule_key: "temp.normal", rule_kind: "measurement_threshold", measurement_type: "temperature", unit: "°C", min_value: 35, max_value: 38, severity: "LOW", status_label: "No fever", recommended_action: "No action needed.", source: TRIAGE },
  { rule_key: "temp.fever", rule_kind: "measurement_threshold", measurement_type: "temperature", unit: "°C", min_value: 38, max_value: 40, severity: "MODERATE", status_label: "Fever", recommended_action: "Rest and fluids. Contact your doctor if it lasts more than 3 days.", source: TRIAGE },
  { rule_key: "temp.high_fever", rule_kind: "measurement_threshold", measurement_type: "temperature", unit: "°C", min_value: 40, max_value: null, severity: "HIGH", status_label: "Very high fever", recommended_action: "Contact your doctor today or seek urgent care.", source: TRIAGE },
  { rule_key: "temp.low", rule_kind: "measurement_threshold", measurement_type: "temperature", unit: "°C", min_value: null, max_value: 35, severity: "HIGH", status_label: "Low body temperature", recommended_action: "Warm up gradually and seek prompt medical advice.", source: TRIAGE },

  // Triage patterns (symptom combinations)
  { rule_key: "triage.breathing_severe", rule_kind: "triage_pattern", pattern: { any: ["severe_breathing_difficulty"] }, severity: "EMERGENCY", status_label: "Serious breathing difficulty", recommended_action: "Call emergency services now.", source: TRIAGE },
  { rule_key: "triage.chest_plus", rule_kind: "triage_pattern", pattern: { all: ["chest_pain"], any: ["shortness_of_breath", "sweating", "radiating_pain", "dizziness", "loss_of_consciousness", "palpitations"] }, severity: "EMERGENCY", status_label: "Chest pain with other concerning symptoms", recommended_action: "Call emergency services now.", source: TRIAGE },
  { rule_key: "triage.stroke", rule_kind: "triage_pattern", pattern: { any: ["facial_droop", "slurred_speech", "one_sided_weakness"] }, severity: "EMERGENCY", status_label: "Possible stroke signs (face, arm, speech)", recommended_action: "Call emergency services now and note the time symptoms started.", source: TRIAGE },
  { rule_key: "triage.unconscious", rule_kind: "triage_pattern", pattern: { any: ["loss_of_consciousness"] }, severity: "EMERGENCY", status_label: "Loss of consciousness", recommended_action: "Call emergency services now.", source: TRIAGE },
  { rule_key: "triage.seizure", rule_kind: "triage_pattern", pattern: { any: ["seizure"] }, severity: "EMERGENCY", status_label: "Seizure", recommended_action: "Call emergency services now.", source: TRIAGE },
  { rule_key: "triage.anaphylaxis", rule_kind: "triage_pattern", pattern: { any: ["throat_swelling", "severe_allergic_reaction"] }, severity: "EMERGENCY", status_label: "Possible severe allergic reaction", recommended_action: "Use an adrenaline auto-injector if prescribed and call emergency services.", source: TRIAGE },
  { rule_key: "triage.bleeding", rule_kind: "triage_pattern", pattern: { any: ["severe_bleeding"] }, severity: "EMERGENCY", status_label: "Significant bleeding", recommended_action: "Apply firm pressure and call emergency services.", source: TRIAGE },
  { rule_key: "triage.poisoning", rule_kind: "triage_pattern", pattern: { any: ["poisoning_overdose"] }, severity: "EMERGENCY", status_label: "Possible poisoning or overdose", recommended_action: "Call emergency services or poison help now. Don't induce vomiting unless told to.", source: TRIAGE },
  { rule_key: "triage.self_harm", rule_kind: "triage_pattern", pattern: { any: ["self_harm"], crisis: true }, severity: "EMERGENCY", status_label: "Thoughts of self-harm", recommended_action: "Contact a crisis line or emergency services now.", source: TRIAGE },
  { rule_key: "triage.thunderclap", rule_kind: "triage_pattern", pattern: { any: ["worst_headache"] }, severity: "EMERGENCY", status_label: "Sudden severe headache", recommended_action: "Call emergency services now.", source: TRIAGE },
  { rule_key: "triage.meningism", rule_kind: "triage_pattern", pattern: { all: ["fever", "stiff_neck"] }, severity: "EMERGENCY", status_label: "Fever with stiff neck", recommended_action: "Seek emergency care now.", source: TRIAGE },
  { rule_key: "triage.bp_symptoms", rule_kind: "triage_pattern", pattern: { measurement: { type: "blood_pressure", minSeverity: "HIGH" }, any: ["chest_pain", "shortness_of_breath", "one_sided_weakness", "blurred_vision", "confusion", "worst_headache", "headache"] }, severity: "EMERGENCY", status_label: "Very high blood pressure with symptoms", recommended_action: "Call emergency services now.", source: TRIAGE },
  { rule_key: "triage.glucose_high_symptoms", rule_kind: "triage_pattern", pattern: { measurement: { type: "blood_glucose", minSeverity: "HIGH" }, any: ["confusion", "shortness_of_breath", "loss_of_consciousness"] }, severity: "EMERGENCY", status_label: "Very abnormal sugar with concerning symptoms", recommended_action: "Seek emergency care now.", source: TRIAGE },
  { rule_key: "triage.chest_pain", rule_kind: "triage_pattern", pattern: { any: ["chest_pain"] }, severity: "HIGH", status_label: "Chest pain", recommended_action: "Chest pain should be checked by a doctor promptly. If it's severe, spreading, or with breathlessness or sweating, call emergency services.", source: TRIAGE },
  { rule_key: "triage.breathless", rule_kind: "triage_pattern", pattern: { any: ["shortness_of_breath"] }, severity: "HIGH", status_label: "Shortness of breath", recommended_action: "Breathlessness should be checked by a doctor today. If it's severe or worsening, call emergency services.", source: TRIAGE },
  { rule_key: "triage.injury", rule_kind: "triage_pattern", pattern: { any: ["serious_injury"] }, severity: "HIGH", status_label: "Possible serious injury", recommended_action: "Get prompt medical assessment.", source: TRIAGE },
  { rule_key: "triage.confusion", rule_kind: "triage_pattern", pattern: { any: ["confusion"] }, severity: "HIGH", status_label: "New confusion", recommended_action: "New confusion needs prompt medical assessment.", source: TRIAGE },
];
