/**
 * Typical adult reference bands used by "Understand a Test Result" when a person types a single value.
 * Labs use slightly different ranges, so answers always say "your lab's range may differ".
 * Sources: ADA Standards of Care (HbA1c), NCEP ATP III (cholesterol), common lab reference ranges (TSH, haemoglobin).
 * Demo content — requires clinical review before production use.
 */
export type Band = { label: string; tone: "ok" | "borderline" | "high" | "low"; meaning: string; doctor: string | null };

export interface TestDef {
  key: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  placeholder: string;
  measurementType?: "hba1c";
  band: (v: number, ctx: { sex: string | null }) => Band;
}

export const VALUE_TESTS: Record<string, TestDef> = {
  hba1c: {
    key: "hba1c",
    name: "HbA1c",
    unit: "%",
    min: 3,
    max: 20,
    step: 0.1,
    placeholder: "e.g. 6.4",
    measurementType: "hba1c",
    band: (v) =>
      v < 5.7
        ? { label: "In the typical range", tone: "ok", meaning: "This suggests your average blood sugar over the last 2–3 months has been in the usual range.", doctor: null }
        : v < 6.5
          ? { label: "In the prediabetes range", tone: "borderline", meaning: "This is above the typical range but below the level used to diagnose diabetes. Diet, activity and weight changes often help bring it down.", doctor: "General Physician" }
          : { label: "In the diabetes range", tone: "high", meaning: "A value at this level is in the range used to diagnose diabetes, or suggests sugar control could be improved if diabetes is already known.", doctor: "Diabetologist" },
  },
  cholesterol: {
    key: "cholesterol",
    name: "Total cholesterol",
    unit: "mg/dL",
    min: 50,
    max: 600,
    step: 1,
    placeholder: "e.g. 210",
    band: (v) =>
      v < 200
        ? { label: "Desirable", tone: "ok", meaning: "Total cholesterol is in the desirable range. LDL and HDL values give a fuller picture.", doctor: null }
        : v < 240
          ? { label: "Borderline high", tone: "borderline", meaning: "This is a little above the desirable range. Diet, activity and checking LDL/HDL help decide if anything more is needed.", doctor: "General Physician" }
          : { label: "High", tone: "high", meaning: "This is in the high range. A doctor will usually look at your LDL, HDL and overall heart risk together.", doctor: "General Physician" },
  },
  thyroid: {
    key: "thyroid",
    name: "TSH",
    unit: "mIU/L",
    min: 0.01,
    max: 100,
    step: 0.01,
    placeholder: "e.g. 3.2",
    band: (v) =>
      v < 0.4
        ? { label: "Lower than typical", tone: "low", meaning: "A low TSH can mean the thyroid is more active than usual. It's usually checked again with other thyroid tests.", doctor: "Endocrinologist" }
        : v <= 4.0
          ? { label: "In the typical range", tone: "ok", meaning: "TSH is in the usual range, which generally suggests normal thyroid function.", doctor: null }
          : v <= 10
            ? { label: "Mildly raised", tone: "borderline", meaning: "A mildly raised TSH can mean the thyroid is a little underactive. It's often rechecked in a few weeks.", doctor: "General Physician" }
            : { label: "Raised", tone: "high", meaning: "A TSH at this level often means the thyroid is underactive and may need treatment.", doctor: "Endocrinologist" },
  },
  haemoglobin: {
    key: "haemoglobin",
    name: "Haemoglobin",
    unit: "g/dL",
    min: 3,
    max: 25,
    step: 0.1,
    placeholder: "e.g. 11.8",
    band: (v, { sex }) => {
      const low = sex === "male" ? 13.5 : 12;
      const high = sex === "male" ? 17.5 : 15.5;
      if (v < low - 2) return { label: "Low", tone: "low", meaning: "This is clearly below the typical range, which can mean anaemia. A doctor will want to find the cause.", doctor: "General Physician" };
      if (v < low) return { label: "Slightly low", tone: "borderline", meaning: "This is a little below the typical range. Iron, B12 or folate levels are often checked next.", doctor: "General Physician" };
      if (v > high) return { label: "Higher than typical", tone: "high", meaning: "This is above the typical range. It can happen with dehydration, smoking or other causes worth checking.", doctor: "General Physician" };
      return { label: "In the typical range", tone: "ok", meaning: "Haemoglobin is in the usual range.", doctor: null };
    },
  },
};

/** Lab-history canonical names that are relevant to each test choice. */
export const RELATED_LAB: Record<string, string> = {
  blood_sugar: "HbA1c",
  hba1c: "HbA1c",
  cholesterol: "Total cholesterol",
  thyroid: "TSH",
  cbc: "Haemoglobin",
  haemoglobin: "Haemoglobin",
};
