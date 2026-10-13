export type UserRole = "PATIENT" | "FAMILY_ADMIN" | "DOCTOR" | "ADMIN";
export type Urgency = "LOW" | "MODERATE" | "HIGH" | "EMERGENCY";
export type Relationship = "self" | "mother" | "father" | "spouse" | "child" | "sibling" | "grandparent" | "other" | "pet";

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  self: "Myself",
  mother: "Mother",
  father: "Father",
  spouse: "Spouse",
  child: "Child",
  sibling: "Sibling",
  grandparent: "Grandparent",
  other: "Other",
  pet: "Pet",
};

export const SPECIES_LABELS: Record<string, string> = { dog: "Dog", cat: "Cat", rabbit: "Rabbit", bird: "Bird", other: "Pet" };

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  countryCode: string;
  isDemo: boolean;
}

export interface Actor extends SessionUser {
  familyIds: string[];
  /** Family the user is currently acting in (patients). */
  familyId: string | null;
  familyRole: "FAMILY_ADMIN" | "MEMBER" | null;
  /** Present when the user is a doctor. */
  doctorId: string | null;
}

export interface Profile {
  id: string;
  family_id: string;
  user_id: string | null;
  display_name: string;
  relationship: Relationship;
  date_of_birth: string | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  blood_group: string | null;
  pregnancy_status: string | null;
  photo_url: string | null;
  avatar_color: string;
  lifestyle: Record<string, unknown>;
  family_history: string | null;
  previous_surgeries: string | null;
  insurance: Record<string, unknown> | null;
  primary_doctor_id: string | null;
  /** Pets only. */
  species?: string | null;
  breed?: string | null;
  neutered?: boolean | null;
  is_demo: boolean;
  created_at: Date;
}

export type MeasurementType =
  | "blood_glucose"
  | "hba1c"
  | "blood_pressure"
  | "heart_rate"
  | "temperature"
  | "weight"
  | "height"
  | "bmi"
  | "spo2"
  | "sleep_duration"
  | "steps";

export type GlucoseContext = "fasting" | "before_meal" | "after_meal" | "random" | "bedtime";

export interface Measurement {
  id: string;
  profile_id: string;
  measurement_type: MeasurementType;
  value: number;
  secondary_value: number | null;
  unit: string;
  context: string | null;
  minutes_after_meal: number | null;
  source: string;
  measured_at: Date;
  notes: string | null;
}

export interface Medication {
  id: string;
  profile_id: string;
  name: string;
  generic_name: string | null;
  brand_name: string | null;
  strength: string | null;
  form: string | null;
  frequency: string | null;
  duration: string | null;
  reason: string | null;
  instructions: string | null;
  prescribing_doctor: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "stopped" | "completed";
  original_text: string | null;
  terminology_confidence: number | null;
  reminder_times: string[];
  created_at: Date;
}

export interface Doctor {
  id: string;
  user_id: string;
  full_name: string;
  speciality: string;
  clinic_name: string | null;
  clinic_address: string | null;
  languages: string[];
  consultation_types: string[];
  bio: string | null;
  photo_url: string | null;
  registration_number: string | null;
  contact_hours: string | null;
  accepting_reviews: boolean;
  is_demo: boolean;
}
