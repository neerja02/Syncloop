/**
 * FICTIONAL DEMO DATA. No real patient information. Every demo row is flagged with is_demo where the table allows.
 *
 * Accounts (password for all: Demo@1234):
 *   demo@kinwell.health     — Neerja Jain, family admin of the "Jain Family (Demo)"
 *   doctor@kinwell.health   — Dr. A. Sharma (Demo), assigned family doctor of the Jain family
 *   doctor2@kinwell.health  — Dr. R. Mehta (Demo), assigned to the Rivera family only
 *   rivera@kinwell.health   — Carlos Rivera, a separate family (used to demonstrate isolation)
 *   admin@kinwell.health    — Platform admin (clinical rules, audit)
 */
import type { Db } from "@/lib/database/client";
import { hashPassword } from "@/lib/security/crypto";
import { sha256 } from "@/lib/security/crypto";
import { SEED_RULES } from "./clinical-rules";
import { DEMO_KNOWLEDGE } from "./knowledge-content";
import { paginate, simplePdf, wrapLines } from "@/lib/utils/simple-pdf";
import { LocalStorageProvider } from "@/lib/integrations/storage";
import { MockEmbeddingProvider } from "@/lib/ai/providers/mock";

export const DEMO_PASSWORD = "Demo@1234";
const DAY = 86400000;
const now = Date.now();
const daysAgo = (d: number, hour = 9, minute = 0) => {
  const x = new Date(now - d * DAY);
  x.setHours(hour, minute, 0, 0);
  return x;
};
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// Deterministic pseudo-random so demo data is stable between resets.
let seedState = 42;
const rand = () => {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
};
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

export async function seedIfEmpty(db: Db) {
  const { rows } = await db.query<{ n: number }>("select count(*) as n from users");
  if (rows[0]!.n > 0) return false;
  await seedDemo(db);
  return true;
}

async function insert<T = { id: string }>(db: Db, sql: string, params: unknown[]): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0]!;
}

export async function seedDemo(db: Db, log: (m: string) => void = () => {}) {
  const storage = new LocalStorageProvider();
  const pw = await hashPassword(DEMO_PASSWORD);

  // ---------------------------------------------------------------- clinical rules
  for (const r of SEED_RULES) {
    await db.query(
      `insert into clinical_rules(rule_key, rule_kind, condition, measurement_type, context, diagnosis_status, age_min, age_max, unit, min_value, max_value, secondary_min, secondary_max,
        pattern, severity, status_label, recommended_action, jurisdiction, source, version, priority, reviewed_by, reviewed_at, active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,'GLOBAL',$18,1,$19,'Pending clinical review (demo)',null,true)`,
      [r.rule_key, r.rule_kind, r.condition ?? null, r.measurement_type ?? null, r.context ?? null, r.diagnosis_status ?? "any", r.age_min ?? null, r.age_max ?? null, r.unit ?? null, r.min_value ?? null, r.max_value ?? null, r.secondary_min ?? null, r.secondary_max ?? null, r.pattern ? JSON.stringify(r.pattern) : null, r.severity, r.status_label, r.recommended_action, r.source, r.priority ?? 100],
    );
  }
  log(`clinical rules: ${SEED_RULES.length}`);

  // ---------------------------------------------------------------- users
  const user = (email: string, name: string, role: string) =>
    insert(db, "insert into users(email, password_hash, full_name, role, email_verified_at, onboarding_completed_at, country_code, is_demo) values ($1,$2,$3,$4,now(),now(),'IN',true) returning id", [email, pw, name, role]);
  const demo = await user("demo@kinwell.health", "Neerja Jain", "FAMILY_ADMIN");
  const docUser = await user("doctor@kinwell.health", "Dr. A. Sharma", "DOCTOR");
  const doc2User = await user("doctor2@kinwell.health", "Dr. R. Mehta", "DOCTOR");
  const rivera = await user("rivera@kinwell.health", "Carlos Rivera", "FAMILY_ADMIN");
  await user("admin@kinwell.health", "Kinwell Admin", "ADMIN");
  for (const u of [demo, docUser, doc2User, rivera]) {
    await db.query("insert into user_preferences(user_id, location_permission, latitude, longitude, location_label) values ($1,'granted',18.5204,73.8567,'Pune (demo)')", [u.id]);
    for (const c of ["terms", "privacy", "ai_processing", "doctor_sharing"]) await db.query("insert into consents(user_id, consent_type, granted) values ($1,$2,true)", [u.id, c]);
  }

  // ---------------------------------------------------------------- doctors
  const sharma = await insert(db, `insert into doctors(user_id, full_name, speciality, clinic_name, clinic_address, languages, consultation_types, bio, registration_number, contact_hours, is_demo)
    values ($1,'Dr. A. Sharma','General Physician & Diabetologist','Sharma Family Clinic (Demo)','12 Demo Lane, Kothrud, Pune', $2, $3,
    'Fictional demo doctor. Family medicine with a focus on diabetes and blood pressure care.','DEMO-MCI-00012','Mon–Sat, 10:00–13:00 & 17:00–20:00',true) returning id`, [docUser.id, ["English", "Hindi", "Marathi"], ["in_person", "teleconsultation", "phone"]]);
  const mehta = await insert(db, `insert into doctors(user_id, full_name, speciality, clinic_name, clinic_address, languages, consultation_types, bio, registration_number, contact_hours, is_demo)
    values ($1,'Dr. R. Mehta','Paediatrician & Family Medicine','Mehta Child & Family Care (Demo)','8 Sample Road, Andheri, Mumbai', $2, $3, 'Fictional demo doctor.', 'DEMO-MCI-00034','Mon–Fri, 09:00–17:00', true) returning id`, [doc2User.id, ["English", "Hindi", "Spanish"], ["in_person", "teleconsultation"]]);

  // ---------------------------------------------------------------- Jain family
  const fam = await insert(db, "insert into families(name, created_by, country_code, is_demo) values ('Jain Family (Demo)',$1,'IN',true) returning id", [demo.id]);
  await db.query("insert into family_memberships(family_id, user_id, role) values ($1,$2,'FAMILY_ADMIN')", [fam.id, demo.id]);
  const folders: Record<string, string> = {};
  for (const [name, icon] of [["Blood Tests", "droplet"], ["Diabetes", "activity"], ["Heart", "heart"], ["Prescriptions", "pill"], ["Imaging", "scan"], ["Annual Checkups", "calendar-check"]]) {
    folders[name!] = (await insert(db, "insert into report_folders(family_id, name, icon, is_default, created_by) values ($1,$2,$3,true,$4) returning id", [fam.id, name, icon, demo.id])).id;
  }
  folders["Mom's Thyroid"] = (await insert(db, "insert into report_folders(family_id, name, icon, created_by) values ($1,$2,'folder',$3) returning id", [fam.id, "Mom's Thyroid", demo.id])).id;

  const profile = (name: string, rel: string, dob: string, sex: string, h: number, w: number, bg: string, color: string, extra: Record<string, unknown> = {}, userId: string | null = null) =>
    insert(db, `insert into profiles(family_id, user_id, display_name, relationship, date_of_birth, sex, height_cm, weight_kg, blood_group, avatar_color, lifestyle, family_history, primary_doctor_id, is_demo)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,true) returning id`, [fam.id, userId, name, rel, dob, sex, h, w, bg, color, JSON.stringify(extra.lifestyle ?? {}), extra.family_history ?? null, sharma.id]);
  const me = await profile("Neerja", "self", "1988-04-12", "female", 163, 64, "B+", "#3D83DF", { lifestyle: { activityLevel: "moderate", diet: "Vegetarian", smoking: "never", alcohol: "occasional", sleepGoalHours: 7.5 }, family_history: "Father: high cholesterol. Mother: hypertension." }, demo.id);
  const mom = await profile("Mom", "mother", "1961-08-03", "female", 158, 64, "O+", "#BE185D", { lifestyle: { activityLevel: "low", diet: "Vegetarian" } });
  const dad = await profile("Dad", "father", "1958-01-21", "male", 170, 76, "B+", "#B45309", { lifestyle: { activityLevel: "moderate", smoking: "former" } });
  // A pet — companion animals get vet triage instead of human triage.
  await db.query(
    `insert into profiles(family_id, user_id, display_name, relationship, date_of_birth, sex, weight_kg, avatar_color, species, breed, neutered, is_demo)
     values ($1,null,'Bruno','pet','2021-06-15','male',28,'#15803D','dog','Labrador',true,true)`,
    [fam.id],
  );

  await db.query("insert into doctor_family_assignments(doctor_id, family_id, assigned_at) values ($1,$2,$3)", [sharma.id, fam.id, daysAgo(400)]);

  // Conditions, allergies, emergency contacts
  const cond = (p: string, name: string, since: string, source = "doctor") => db.query("insert into health_conditions(profile_id, name, status, diagnosed_on, source) values ($1,$2,'active',$3,$4)", [p, name, since, source]);
  await cond(me.id, "Type 2 diabetes", "2023-05-10");
  await cond(mom.id, "Hypertension", "2016-02-01");
  await cond(mom.id, "Hypothyroidism", "2019-07-15");
  await cond(dad.id, "High cholesterol", "2026-08-20");
  await db.query("insert into allergies(profile_id, substance, reaction, severity) values ($1,'Penicillin','Rash','moderate')", [me.id]);
  await db.query("insert into allergies(profile_id, substance, reaction, severity) values ($1,'Sulfa drugs','Hives','mild')", [mom.id]);
  await db.query("insert into emergency_contacts(profile_id, name, relationship, phone) values ($1,'Rohan Jain (Demo)','Spouse','+91 90000 00001')", [me.id]);
  await db.query("insert into emergency_contacts(profile_id, name, relationship, phone) values ($1,'Neerja Jain (Demo)','Daughter','+91 90000 00002')", [mom.id]);
  await db.query("insert into emergency_contacts(profile_id, name, relationship, phone) values ($1,'Neerja Jain (Demo)','Daughter','+91 90000 00002')", [dad.id]);

  // Medications
  const med = (p: string, name: string, generic: string, strength: string, form: string, freq: string, reason: string, instr: string, start: string, times: string[], status = "active", end: string | null = null) =>
    db.query(
      `insert into medications(profile_id, name, generic_name, strength, form, frequency, reason, instructions, prescribing_doctor, start_date, end_date, status, reminder_times, terminology_confidence, external_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'Dr. A. Sharma',$9,$10,$11,$12,1,$13)`,
      [p, name, generic, strength, form, freq, reason, instr, start, end, status, times, `local:${generic.toLowerCase()}`],
    );
  await med(me.id, "Metformin", "Metformin", "500 mg", "tablet", "Twice daily", "Type 2 diabetes", "Take with breakfast and dinner", "2023-05-12", ["08:30", "20:30"]);
  await med(me.id, "Vitamin D3", "Cholecalciferol", "60,000 IU", "sachet", "Once a week", "Low vitamin D", "Sunday after breakfast", "2026-06-01", [], "completed", "2026-08-31");
  await med(mom.id, "Telmisartan", "Telmisartan", "40 mg", "tablet", "Once daily", "Hypertension", "Every morning", "2016-02-10", ["08:00"]);
  await med(mom.id, "Levothyroxine", "Levothyroxine", "50 mcg", "tablet", "Once daily", "Hypothyroidism", "Empty stomach, 30–60 min before breakfast", "2019-07-20", ["06:30"]);
  await med(dad.id, "Atorvastatin", "Atorvastatin", "10 mg", "tablet", "Once daily", "High cholesterol", "At night", isoDate(daysAgo(40)), ["21:30"]);

  // Measurements — Neerja glucose (60 days), Mom BP, weights, sleep, steps
  for (let d = 60; d >= 1; d--) {
    if (d % 2 === 0) await db.query("insert into measurements(profile_id, measurement_type, value, unit, context, source, measured_at) values ($1,'blood_glucose',$2,'mg/dL','fasting','manual',$3)", [me.id, between(d > 30 ? 128 : 112, d > 30 ? 152 : 138), daysAgo(d, 7, 15)]);
    if (d % 3 === 0) await db.query("insert into measurements(profile_id, measurement_type, value, unit, context, minutes_after_meal, source, measured_at) values ($1,'blood_glucose',$2,'mg/dL','after_meal',120,'manual',$3)", [me.id, between(d > 30 ? 175 : 150, d > 30 ? 215 : 192), daysAgo(d, 15, 0)]);
    if (d % 2 === 1) await db.query("insert into measurements(profile_id, measurement_type, value, secondary_value, unit, context, source, measured_at) values ($1,'blood_pressure',$2,$3,'mmHg','morning','manual',$4)", [mom.id, between(132, 152), between(82, 94), daysAgo(d, 8, 0)]);
    await db.query("insert into measurements(profile_id, measurement_type, value, unit, source, measured_at) values ($1,'sleep_duration',$2,'hours','device',$3)", [me.id, Math.round((5.6 + rand() * 2.4) * 10) / 10, daysAgo(d, 7, 0)]);
    await db.query("insert into measurements(profile_id, measurement_type, value, unit, source, measured_at) values ($1,'steps',$2,'steps','device',$3)", [me.id, between(3800, 10400), daysAgo(d, 22, 0)]);
    if (d % 7 === 0) await db.query("insert into measurements(profile_id, measurement_type, value, unit, source, measured_at) values ($1,'weight',$2,'kg','manual',$3)", [me.id, Math.round((84.5 - (60 - d) * 0.045 + rand() * 0.4) * 10) / 10, daysAgo(d, 7, 30)]);
  }
  await db.query("insert into measurements(profile_id, measurement_type, value, unit, context, source, measured_at) values ($1,'heart_rate',72,'bpm','resting','manual',$2)", [me.id, daysAgo(1, 8)]);
  await db.query("insert into measurements(profile_id, measurement_type, value, secondary_value, unit, context, source, measured_at) values ($1,'blood_pressure',128,82,'mmHg','resting','manual',$2)", [me.id, daysAgo(2, 8)]);
  await db.query("insert into measurements(profile_id, measurement_type, value, secondary_value, unit, context, source, measured_at) values ($1,'blood_pressure',138,86,'mmHg','morning','manual',$2)", [dad.id, daysAgo(3, 8)]);
  log("measurements");

  // Reports (fictional PDFs generated on the fly)
  async function report(o: {
    profileId: string;
    folder: string;
    title: string;
    type: string;
    date: Date;
    lab: string;
    lines: string[];
    results: { test: string; canonical: string; value: number | null; text: string; unit: string; range: string | null; flag: string | null; status: string; confidence: number; type?: string }[];
    summary: string;
    status?: string;
    doctorNotes?: string | null;
    reviewed?: boolean;
    measurementType?: string;
  }) {
    const id = (await insert(db, `insert into reports(family_id, profile_id, folder_id, title, document_type, report_date, lab_name, status, quality, summary, raw_text, extraction, provider, doctor_reviewed_at, doctor_reviewed_by, doctor_notes, uploaded_by, is_demo, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,'local',$13,$14,$15,$16,true,$17) returning id`, [
      fam.id, o.profileId, folders[o.folder], o.title, o.type, isoDate(o.date), o.lab, o.status ?? "processed",
      JSON.stringify({ score: o.status === "needs_confirmation" ? 0.56 : 1, readable: true, issues: o.status === "needs_confirmation" ? ["Blurry", "Some characters could not be read reliably"] : [] }),
      o.summary, o.lines.join("\n"), JSON.stringify({ provider: "local", isMock: false, documentType: { type: o.type, confidence: 0.92 }, reportDate: { value: isoDate(o.date), confidence: 0.95 } }),
      o.reviewed ? o.date : null, o.reviewed ? sharma.id : null, o.doctorNotes ?? null, demo.id, o.date,
    ])).id;
    const pdf = simplePdf(paginate(o.lines), { title: o.title });
    const key = `families/${fam.id}/reports/${id}/original.pdf`;
    await storage.put(key, pdf);
    await db.query("insert into report_files(report_id, storage_key, original_filename, mime_type, size_bytes, sha256, variant) values ($1,$2,$3,'application/pdf',$4,$5,'original')", [id, key, `${o.title.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`, pdf.length, sha256(pdf)]);
    for (const r of o.results) {
      await db.query(
        `insert into report_results(report_id, profile_id, test_name, canonical_name, value, value_text, unit, reference_range, flag, confidence, page_number, raw_text, normalised_text, field_type, status, observed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11,$12,$13,$14,$15)`,
        [id, o.profileId, r.test, r.canonical, r.value, r.text, r.unit, r.range, r.flag, r.confidence, `${r.test} ${r.text} ${r.unit} ${r.range ?? ""}`.trim(), `${r.canonical} ${r.value ?? "[unreadable]"} ${r.unit}`, r.type ?? "lab_value", r.status, isoDate(o.date)],
      );
      if (r.canonical === "HbA1c" && r.value != null && r.status === "confirmed") {
        await db.query("insert into measurements(profile_id, measurement_type, value, unit, source, report_id, measured_at, notes) values ($1,'hba1c',$2,'%','report',$3,$4,'From report')", [o.profileId, r.value, id, o.date]);
      }
    }
    return id;
  }
  const hba1cReport = (d: Date, v: number, fbs: number, label: string) =>
    report({
      profileId: me.id,
      folder: "Diabetes",
      title: `HbA1c & Glucose — ${label}`,
      type: "blood_test",
      date: d,
      lab: "CityCare Diagnostics (Demo)",
      lines: ["CityCare Diagnostics (DEMO - fictional)", `Patient: Neerja Jain (demo)    Date: ${d.toLocaleDateString("en-GB")}`, "Test   Result   Unit   Reference Range", `HbA1c ${v} % 4.0 - 5.6`, `Fasting Blood Glucose ${fbs} mg/dL 70 - 99`, "Comment: Fictional report for demonstration only."],
      results: [
        { test: "HbA1c", canonical: "HbA1c", value: v, text: String(v), unit: "%", range: "4.0 – 5.6", flag: "high", status: "confirmed", confidence: 0.98 },
        { test: "Fasting Blood Glucose", canonical: "Fasting blood glucose", value: fbs, text: String(fbs), unit: "mg/dL", range: "70 – 99", flag: "high", status: "confirmed", confidence: 0.98 },
      ],
      summary: `This report includes 2 test results. Both are above the reference ranges printed on the report, which is expected with diabetes and worth tracking over time.`,
      reviewed: true,
    });
  await hba1cReport(daysAgo(190), 8.1, 164, "Mar 2026");
  await hba1cReport(daysAgo(100), 7.8, 148, "Jun 2026");
  const latestHba1c = await hba1cReport(daysAgo(12), 7.2, 131, "Sep 2026");
  await db.query("update reports set doctor_notes = 'HbA1c improving (7.8 → 7.2). Continue metformin and the evening walks. Repeat in 3 months.' where id = $1", [latestHba1c]);

  await report({
    profileId: dad.id,
    folder: "Heart",
    title: "Lipid Profile — Aug 2026",
    type: "blood_test",
    date: daysAgo(42),
    lab: "CityCare Diagnostics (Demo)",
    lines: ["CityCare Diagnostics (DEMO - fictional)", "Patient: Dad (demo)", "Total Cholesterol 236 mg/dL < 200", "LDL Cholesterol 152 mg/dL < 100", "HDL Cholesterol 41 mg/dL > 40", "Triglycerides 188 mg/dL < 150"],
    results: [
      { test: "Total Cholesterol", canonical: "Total cholesterol", value: 236, text: "236", unit: "mg/dL", range: "< 200", flag: "high", status: "confirmed", confidence: 0.97 },
      { test: "LDL Cholesterol", canonical: "LDL cholesterol", value: 152, text: "152", unit: "mg/dL", range: "< 100", flag: "high", status: "confirmed", confidence: 0.97 },
      { test: "HDL Cholesterol", canonical: "HDL cholesterol", value: 41, text: "41", unit: "mg/dL", range: "> 40", flag: "normal", status: "confirmed", confidence: 0.97 },
      { test: "Triglycerides", canonical: "Triglycerides", value: 188, text: "188", unit: "mg/dL", range: "< 150", flag: "high", status: "confirmed", confidence: 0.97 },
    ],
    summary: "This report includes 4 test results. 3 are outside the reference range printed on the report (Total cholesterol, LDL cholesterol, Triglycerides). That's worth discussing with your doctor, but on its own it isn't a diagnosis.",
    reviewed: true,
    doctorNotes: "LDL is above target. Starting atorvastatin 10 mg at night; recheck lipid profile in 3 months. Limit fried food and walk 30 minutes, 5 days a week.",
  });
  await report({
    profileId: mom.id,
    folder: "Blood Tests",
    title: "CBC & Thyroid — Sep 2026",
    type: "blood_test",
    date: daysAgo(20),
    lab: "CityCare Diagnostics (Demo)",
    lines: ["CityCare Diagnostics (DEMO - fictional)", "Patient: Mom (demo)", "Haemoglobin 12.4 g/dL 12.0 - 15.5", "Platelets 245 x10^3/uL 150 - 410", "TSH 3.1 mIU/L 0.4 - 4.0"],
    results: [
      { test: "Haemoglobin", canonical: "Haemoglobin", value: 12.4, text: "12.4", unit: "g/dL", range: "12.0 – 15.5", flag: "normal", status: "confirmed", confidence: 0.98 },
      { test: "Platelets", canonical: "Platelets", value: 245, text: "245", unit: "×10³/µL", range: "150 – 410", flag: "normal", status: "confirmed", confidence: 0.98 },
      { test: "TSH", canonical: "TSH", value: 3.1, text: "3.1", unit: "mIU/L", range: "0.4 – 4.0", flag: "normal", status: "confirmed", confidence: 0.98 },
    ],
    summary: "This report includes 3 test results. All readable values are within the reference ranges printed on the report.",
  });
  await report({
    profileId: mom.id,
    folder: "Diabetes",
    title: "Lab photo — HbA1c (blurry)",
    type: "blood_test",
    date: daysAgo(3),
    lab: "Sunrise Path Lab (Demo)",
    status: "needs_confirmation",
    lines: ["Sunrise Path Lab (DEMO - fictional)", "HbA1c 6.? %", "Fasting Blood Glucose 1?8 mg/dL"],
    results: [
      { test: "HbA1c", canonical: "HbA1c", value: null, text: "6.?", unit: "%", range: "4.0 – 5.6", flag: null, status: "unreadable", confidence: 0.34 },
      { test: "Fasting Blood Glucose", canonical: "Fasting blood glucose", value: null, text: "1?8", unit: "mg/dL", range: "70 – 99", flag: null, status: "unreadable", confidence: 0.33 },
    ],
    summary: "We couldn't reliably read 2 values and have not guessed them. Please upload a clearer copy or enter the values from the paper report.",
  });
  await report({
    profileId: me.id,
    folder: "Prescriptions",
    title: "Prescription — Sep 2026",
    type: "prescription",
    date: daysAgo(12),
    lab: "Sharma Family Clinic (Demo)",
    status: "needs_confirmation",
    lines: ["Sharma Family Clinic (DEMO - fictional)", "Rx", "Tab Metfornin 500 mg twice daily after meals", "Review after 3 months"],
    results: [{ test: "Metfornin", canonical: "Metformin", value: null, text: "Metfornin 500 mg twice daily after meals", unit: "", range: null, flag: null, status: "needs_confirmation", confidence: 0.89, type: "medication" }],
    summary: "It lists 1 medicine. Please check the names before they're added to your medicine list.",
  });
  log("reports");

  // Doctor instructions & notes
  await db.query("insert into doctor_patient_instructions(profile_id, doctor_id, instruction_type, instruction, reason, topics) values ($1,$2,'monitoring',$3,$4,$5)", [me.id, sharma.id, "Check fasting sugar 3 times a week and a 2-hour post-lunch sugar twice a week. If post-meal readings stay above 200 mg/dL on 3 days in a week, message me through the app.", "Tracking response to metformin", ["blood_glucose", "diabetes"]]);
  await db.query("insert into doctor_patient_instructions(profile_id, doctor_id, instruction_type, instruction, reason, topics) values ($1,$2,'avoid_medicine',$3,$4,$5)", [mom.id, sharma.id, "Avoid ibuprofen, diclofenac and other NSAID painkillers. Use paracetamol for pain or fever.", "NSAIDs can raise blood pressure and interact with telmisartan", ["medication", "fever", "headache", "nsaid"]]);
  await db.query("insert into doctor_patient_instructions(profile_id, doctor_id, instruction_type, instruction, reason, topics) values ($1,$2,'emergency_threshold',$3,$4,$5)", [mom.id, sharma.id, "If BP is 180/110 or higher on two readings 5 minutes apart, call the clinic immediately; with chest pain or weakness, call emergency services.", "Hypertension safety plan", ["blood_pressure"]]);
  await db.query("insert into doctor_patient_instructions(profile_id, doctor_id, instruction_type, instruction, reason, topics) values ($1,$2,'diet_restriction',$3,$4,$5)", [dad.id, sharma.id, "Limit fried food and ghee to once a week; aim for 30 minutes of brisk walking 5 days a week.", "Raised LDL cholesterol", ["diet", "nutrition", "exercise", "cholesterol"]]);
  await db.query("insert into doctor_notes(profile_id, doctor_id, note, created_at) values ($1,$2,$3,$4)", [dad.id, sharma.id, "Lipid profile Aug 2026: LDL cholesterol 152 mg/dL. Starting atorvastatin 10 mg at night. Recheck lipids in 3 months.", daysAgo(40)]);
  await db.query("insert into doctor_notes(profile_id, doctor_id, note, created_at) values ($1,$2,$3,$4)", [me.id, sharma.id, "HbA1c improving (7.8% → 7.2%). Continue metformin 500 mg twice daily. Keep up the evening walks.", daysAgo(10)]);

  // Goals & check-ins
  await db.query("insert into health_goals(profile_id, title, category, target_value, unit, progress) values ($1,'Walk 8,000 steps a day','activity',8000,'steps',62)", [me.id]);
  await db.query("insert into health_goals(profile_id, title, category, target_value, unit, progress, due_date) values ($1,'HbA1c below 7%','measurement',7,'%',70,$2)", [me.id, isoDate(new Date(now + 90 * DAY))]);
  await db.query("insert into health_goals(profile_id, title, category, progress) values ($1,'Sleep 7+ hours on weeknights','sleep',45)", [me.id]);
  await db.query("insert into health_goals(profile_id, title, category, progress) values ($1,'Check BP every morning','measurement',80)", [mom.id]);
  for (const [d, mood] of [[1, "okay"], [2, "tired"], [3, "great"], [5, "okay"]] as const) await db.query("insert into check_ins(profile_id, user_id, mood, created_at) values ($1,$2,$3,$4)", [me.id, demo.id, mood, daysAgo(d, 8, 30)]);

  // Appointments
  await db.query("insert into appointments(family_id, profile_id, doctor_id, starts_at, location, appointment_type, status, notes, created_by) values ($1,$2,$3,$4,'Sharma Family Clinic (Demo)','in_person','confirmed','3-month diabetes review',$5)", [fam.id, me.id, sharma.id, new Date(now + 5 * DAY + 3600000 * 2), demo.id]);
  await db.query("insert into appointments(family_id, profile_id, doctor_id, starts_at, appointment_type, status, notes, created_by) values ($1,$2,$3,$4,'teleconsultation','requested','BP review — morning readings slightly high',$5)", [fam.id, mom.id, sharma.id, new Date(now + 9 * DAY), demo.id]);
  await db.query("insert into appointments(family_id, profile_id, doctor_id, starts_at, location, appointment_type, status, notes, created_by) values ($1,$2,$3,$4,'Sharma Family Clinic (Demo)','in_person','completed','Lipid profile results',$5)", [fam.id, dad.id, sharma.id, daysAgo(40, 11), demo.id]);

  // Conversations (pre-written demo history)
  const conv = async (profileId: string, title: string, when: Date, msgs: { role: string; content: string; cards?: unknown[] }[]) => {
    const c = await insert(db, "insert into conversations(family_id, created_by, active_profile_id, title, last_message_at, created_at) values ($1,$2,$3,$4,$5,$5) returning id", [fam.id, demo.id, profileId, title, when]);
    let t = when.getTime() - msgs.length * 60000;
    for (const m of msgs) {
      await db.query("insert into messages(conversation_id, profile_id, role, content, cards, author_user_id, created_at) values ($1,$2,$3,$4,$5::jsonb,$6,$7)", [c.id, profileId, m.role, m.content, JSON.stringify(m.cards ?? []), m.role === "user" ? demo.id : null, new Date((t += 60000))]);
    }
    return c.id;
  };
  const sugarConv = await conv(me.id, "High blood sugar", daysAgo(0, Math.max(0, new Date().getHours() - 1), 10), [
    { role: "user", content: "My sugar has been high this week." },
    { role: "assistant", content: "What was your latest reading, and was it fasting, before food, after food or random?" },
    { role: "user", content: "196, two hours after lunch" },
    { role: "assistant", content: "196 mg/dL (after a meal · 2 h after meal) — above a common after-meal target for diabetes. Dr. A. Sharma's guidance suggests water and a gentle 10–15 minute walk, and not taking extra tablets on your own. Would you like me to save this reading?" },
  ]);
  await conv(me.id, "Headache after work", daysAgo(0, Math.max(0, new Date().getHours() - 3), 0), [
    { role: "user", content: "I get a headache after work most days." },
    { role: "assistant", content: "I'm sorry you're dealing with this. When did it start, and how strong is it on a scale of 1–10?" },
  ]);
  const momConv = await conv(mom.id, "Mom's blood report", daysAgo(1, 18, 20), [
    { role: "user", content: "Can you explain Mom's CBC and thyroid report?" },
    { role: "assistant", content: "Here's the most recent report for Mom: \"CBC & Thyroid — Sep 2026\". All readable values are within the reference ranges printed on the report." },
  ]);
  await conv(me.id, "Sleep problem", daysAgo(1, 23, 5), [
    { role: "user", content: "I haven't been sleeping well." },
    { role: "assistant", content: "That's frustrating — poor sleep affects everything. Is it hard to fall asleep, are you waking up in the night, or waking too early?" },
  ]);

  // Doctor reviews: one responded (shows the full loop), one pending
  const responded = await insert(db, `insert into doctor_reviews(family_id, profile_id, doctor_id, conversation_id, requested_by, summary, measurements, question, priority, status, doctor_response, responded_at, created_at)
    values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'routine','responded',$9,$10,$11) returning id`, [
    fam.id, me.id, sharma.id, sugarConv, demo.id, "My sugar has been high this week · 196, two hours after lunch",
    JSON.stringify([{ type: "blood_glucose", value: 196, unit: "mg/dL", context: "after_meal" }]),
    "My after-lunch readings have been around 190–200. Should I change anything?",
    "Thanks for logging these. Keep metformin as is for now. Swap white rice at lunch for 1 roti + extra dal/salad and take a 15-minute walk after lunch. Send me 5 more post-lunch readings next week and we'll decide at your review.",
    daysAgo(0, Math.max(0, new Date().getHours() - 1), 40), daysAgo(0, Math.max(0, new Date().getHours() - 1), 15),
  ]);
  await db.query("insert into messages(conversation_id, profile_id, role, content, cards, author_user_id, created_at) values ($1,$2,'doctor',$3,$4::jsonb,$5,$6)", [sugarConv, me.id, "Thanks for logging these. Keep metformin as is for now. Swap white rice at lunch for 1 roti + extra dal/salad and take a 15-minute walk after lunch. Send me 5 more post-lunch readings next week and we'll decide at your review.", JSON.stringify([{ type: "doctor_reply", reviewId: responded.id, doctorName: "Dr. A. Sharma", action: "respond" }]), docUser.id, daysAgo(0, Math.max(0, new Date().getHours() - 1), 41)]);
  await db.query("insert into doctor_notes(profile_id, doctor_id, review_id, note, created_at) values ($1,$2,$3,$4,now())", [me.id, sharma.id, responded.id, "Post-lunch readings ~190–200: diet swap at lunch + 15-min walk after lunch; send 5 more readings next week."]);
  await db.query(`insert into doctor_reviews(family_id, profile_id, doctor_id, conversation_id, requested_by, summary, measurements, question, priority, status)
    values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'soon','pending')`, [fam.id, mom.id, sharma.id, momConv, demo.id, "Mom's morning BP readings have been 140–150 / 88–94 this month.",
    JSON.stringify([{ type: "blood_pressure", value: 148, secondary_value: 92, unit: "mmHg" }]), "Mom's morning BP is a bit higher this month. Does her telmisartan dose need changing?"]);

  await db.query("insert into doctor_messages(family_id, doctor_id, profile_id, sender_user_id, sender_role, body, created_at) values ($1,$2,$3,$4,'family','Hello doctor, Mom has been feeling a little dizzy in the mornings this week.',$5)", [fam.id, sharma.id, mom.id, demo.id, daysAgo(1, 10)]);
  await db.query("insert into doctor_messages(family_id, doctor_id, profile_id, sender_user_id, sender_role, body, created_at, read_at) values ($1,$2,$3,$4,'doctor','Thanks for letting me know. Please ask her to stand up slowly and log BP morning and evening this week. Message me if dizziness gets worse.',$5,now())", [fam.id, sharma.id, mom.id, docUser.id, daysAgo(1, 13)]);

  // Notifications
  const n = (userId: string, kind: string, title: string, body: string, link: string, read = false) => db.query("insert into notifications(user_id, family_id, kind, title, body, link, read_at) values ($1,$2,$3,$4,$5,$6,$7)", [userId, fam.id, kind, title, body, link, read ? new Date() : null]);
  await n(demo.id, "doctor_response", "Your doctor responded", "Dr. A. Sharma replied to your review request about Neerja.", `/app/chat/${sugarConv}`);
  await n(demo.id, "appointment_reminder", "Upcoming appointment", "Diabetes review with Dr. A. Sharma in 5 days.", "/appointments");
  await n(demo.id, "report_processed", "Please confirm a few values", "Some values in \"Lab photo — HbA1c (blurry)\" need your confirmation.", "/reports", true);
  await n(docUser.id, "review_request", "Review requested · soon", "A family asked for your review about Mom.", "/doctor/reviews");

  // ---------------------------------------------------------------- Rivera family (separate, unassigned to Dr. Sharma)
  const rfam = await insert(db, "insert into families(name, created_by, country_code, is_demo) values ('Rivera Family (Demo)',$1,'IN',true) returning id", [rivera.id]);
  await db.query("insert into family_memberships(family_id, user_id, role) values ($1,$2,'FAMILY_ADMIN')", [rfam.id, rivera.id]);
  for (const [name, icon] of [["Blood Tests", "droplet"], ["Prescriptions", "pill"]]) await db.query("insert into report_folders(family_id, name, icon, is_default, created_by) values ($1,$2,$3,true,$4)", [rfam.id, name, icon, rivera.id]);
  const carlos = await insert(db, "insert into profiles(family_id, user_id, display_name, relationship, date_of_birth, sex, avatar_color, is_demo) values ($1,$2,'Carlos','self','1979-11-02','male','#0F766E',true) returning id", [rfam.id, rivera.id]);
  await db.query("insert into measurements(profile_id, measurement_type, value, secondary_value, unit, source, measured_at) values ($1,'blood_pressure',124,80,'mmHg','manual',now() - interval '1 day')", [carlos.id]);
  await db.query("insert into health_conditions(profile_id, name, status, source) values ($1,'Asthma','active','user')", [carlos.id]);
  await db.query("insert into doctor_family_assignments(doctor_id, family_id) values ($1,$2)", [mehta.id, rfam.id]);

  // ---------------------------------------------------------------- doctor knowledge base (RAG)
  const embedder = new MockEmbeddingProvider();
  const { chunkText } = await import("@/lib/services/knowledge");
  for (const k of DEMO_KNOWLEDGE) {
    const lines = wrapLines(k.text);
    const pdf = simplePdf(paginate(lines), { title: k.title });
    const doc = await insert(db, `insert into knowledge_documents(doctor_id, title, category, document_type, version, source, status, active, mime_type, parsed_content, embedding_status, reviewed_at, reviewed_by, is_demo)
      values ($1,$2,$3,'pdf',1,'Written by Dr. A. Sharma (fictional demo content)',$4,$5,'application/pdf',$6,'complete',$7,$8,true) returning id`, [sharma.id, k.title, k.category, k.status, k.status === "approved", k.text, k.status === "approved" ? daysAgo(30) : null, k.status === "approved" ? sharma.id : null]);
    const key = `doctors/${sharma.id}/knowledge/${doc.id}/${k.title.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
    await storage.put(key, pdf);
    await db.query("update knowledge_documents set original_file_url = $2 where id = $1", [doc.id, key]);
    const chunks = chunkText(k.text);
    const vectors = await embedder.embed(chunks.map((c) => `${k.title}. ${c.heading ?? ""}. ${c.content}`));
    for (let i = 0; i < chunks.length; i++) {
      await db.query("insert into knowledge_chunks(document_id, doctor_id, chunk_index, content, embedding, embedding_model, token_count, metadata) values ($1,$2,$3,$4,$5::vector,$6,$7,$8::jsonb)", [doc.id, sharma.id, i, chunks[i]!.content, `[${vectors[i]!.map((x) => x.toFixed(6)).join(",")}]`, embedder.model, Math.ceil(chunks[i]!.content.length / 4), JSON.stringify({ heading: chunks[i]!.heading, category: k.category })]);
    }
    await db.query("update knowledge_documents set chunk_count = $2 where id = $1", [doc.id, chunks.length]);
  }
  for (const s of ["Diabetes", "Blood Pressure", "Fever", "Medication Guides", "Sleep"]) await db.query("insert into knowledge_sources(doctor_id, name) values ($1,$2)", [sharma.id, s]);
  log("knowledge base");

  // ---------------------------------------------------------------- provider directory (fictional)
  const providers: [string, string, string, string, string, number, number, string[], string[], string][] = [
    ["Dr. A. Sharma (Demo)", "doctor", "General Physician & Diabetologist", "Sharma Family Clinic (Demo)", "Kothrud, Pune", 18.5074, 73.8077, ["English", "Hindi", "Marathi"], ["in_person", "teleconsultation"], "Mon–Sat 10:00–13:00, 17:00–20:00"],
    ["Dr. K. Iyer (Demo)", "doctor", "Cardiologist", "HeartWell Clinic (Demo)", "Baner, Pune", 18.559, 73.7868, ["English", "Tamil", "Hindi"], ["in_person"], "Tue, Thu, Sat 11:00–15:00"],
    ["Dr. S. Kulkarni (Demo)", "doctor", "Endocrinologist", "Hormone & Diabetes Centre (Demo)", "Aundh, Pune", 18.5589, 73.8072, ["English", "Marathi"], ["in_person", "teleconsultation"], "Mon–Fri 09:00–14:00"],
    ["Dr. F. Khan (Demo)", "doctor", "Paediatrician", "Little Steps Child Clinic (Demo)", "Camp, Pune", 18.5155, 73.8792, ["English", "Hindi", "Urdu"], ["in_person"], "Mon–Sat 17:00–21:00"],
    ["Dr. M. D'Souza (Demo)", "doctor", "Dermatologist", "ClearSkin Clinic (Demo)", "Koregaon Park, Pune", 18.5362, 73.8939, ["English", "Konkani"], ["in_person", "teleconsultation"], "Wed–Sun 10:00–18:00"],
    ["Dr. P. Rao (Demo)", "doctor", "General Practice", "Riverside Family Practice (Demo)", "Shivajinagar, Pune", 18.5308, 73.8475, ["English", "Telugu", "Hindi"], ["in_person", "phone"], "Daily 08:00–12:00"],
    ["Dr. N. Bose (Demo)", "doctor", "Pulmonologist", "BreatheEasy Chest Clinic (Demo)", "Viman Nagar, Pune", 18.5679, 73.9143, ["English", "Bengali"], ["in_person"], "Mon, Wed, Fri 10:00–16:00"],
    ["City General Hospital — Emergency (Demo)", "emergency", "Emergency Medicine", "City General Hospital (Demo)", "Deccan, Pune", 18.5167, 73.8414, ["English", "Hindi", "Marathi"], ["in_person"], "Open 24 hours"],
    ["Sunrise Multispeciality Hospital (Demo)", "hospital", "Multispeciality", "Sunrise Hospital (Demo)", "Hadapsar, Pune", 18.5089, 73.926, ["English", "Hindi"], ["in_person"], "Open 24 hours"],
    ["CityCare Diagnostics (Demo)", "lab", "Pathology Lab", "CityCare Diagnostics (Demo)", "Kothrud, Pune", 18.5046, 73.8121, ["English", "Hindi", "Marathi"], ["in_person"], "Daily 07:00–20:00"],
    ["Dr. R. Mehta (Demo)", "doctor", "Paediatrician & Family Medicine", "Mehta Child & Family Care (Demo)", "Andheri, Mumbai", 19.1136, 72.8697, ["English", "Hindi", "Spanish"], ["in_person", "teleconsultation"], "Mon–Fri 09:00–17:00"],
    ["PawCare Veterinary Clinic (Demo)", "clinic", "Veterinarian", "PawCare Veterinary Clinic (Demo)", "Baner, Pune", 18.5612, 73.7802, ["English", "Hindi", "Marathi"], ["in_person"], "Mon–Sat 10:00–19:00"],
    ["Pune Animal Emergency Hospital (Demo)", "hospital", "Veterinarian · Emergency", "Pune Animal Emergency Hospital (Demo)", "Wakad, Pune", 18.5986, 73.7647, ["English", "Hindi"], ["in_person"], "Open 24 hours"],
    ["Dr. L. Nair (Demo)", "doctor", "Psychiatrist", "MindSpace Clinic (Demo)", "Kalyani Nagar, Pune", 18.5463, 73.9033, ["English", "Malayalam", "Hindi"], ["in_person", "teleconsultation"], "Mon–Sat 12:00–19:00"],
  ];
  for (const p of providers) {
    await db.query("insert into providers(name, kind, speciality, clinic, address, city, country_code, latitude, longitude, languages, consultation_types, availability, phone, source) values ($1,$2,$3,$4,$5,$6,'IN',$7,$8,$9,$10,$11,'+91 20 0000 0000','mock')", [p[0], p[1], p[2], p[3], p[4], p[4].split(", ").pop(), p[5], p[6], p[7], p[8], p[9]]);
  }
  log("providers");
}
