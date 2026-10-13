import "server-only";
import { decideConfidence } from "@/lib/config/confidence";
import { drugClassesFor, getMedicationTerminology, INTERACTION_CAUTIONS, type MedicationNormalisation } from "@/lib/integrations/terminology/medication";
import { PatientContextService } from "../services/patient-context";
import { excerpt, retrieveDoctorKnowledge } from "../services/retrieval";
import { baseResponse, cardId, type AgentContext, type AgentResult } from "./context";
import type { ChatCard } from "../types";
import { vetEmergencyFromText } from "../guided/agent";

const STOP = new Set(["what", "this", "that", "medicine", "medication", "tablet", "tablets", "pill", "pills", "take", "taking", "should", "when", "with", "does", "doctor", "recommend", "recommended", "about", "have", "fever", "conflict", "another", "can", "dose", "safe", "morning", "night", "daily", "twice", "started", "prescribed", "mother", "father", "today", "after", "before", "food", "meal", "meals", "lunch", "dinner", "breakfast", "yes", "meant", "mean", "side", "effects", "effect", "interact", "with", "together", "headache", "cold", "cough", "sugar", "pressure", "blood"]);

/** Finds the most likely medicine mentioned in a message. */
async function findMedicine(message: string): Promise<MedicationNormalisation | null> {
  const words = (message.match(/[A-Za-z][A-Za-z0-9-]{3,}/g) ?? []).filter((w) => !STOP.has(w.toLowerCase()));
  const candidates = [...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)];
  const term = getMedicationTerminology();
  let best: MedicationNormalisation | null = null;
  for (const c of candidates) {
    const n = await term.normalise(c);
    if (n.canonical_name && (!best || n.confidence > best.confidence)) best = { ...n, original_text: c };
  }
  return best && best.confidence >= 0.6 ? best : null;
}

export async function medicationAgent(ctx: AgentContext): Promise<AgentResult> {
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  let t = ctx.message.toLowerCase();
  const confirmed = ctx.message.match(/yes,? i meant ([A-Za-z][A-Za-z -]+)/i)?.[1]?.trim();
  const found = await findMedicine(confirmed ?? ctx.message);
  const askingDoctorRecommendation = /doctor (recommend|suggest|prescribe|advise|said)|what (medicine|tablet)/.test(t) && (!found || found.confidence < 0.8);

  if (askingDoctorRecommendation) return doctorRecommendation(ctx, patient);

  // Animals: never human medicine without a vet's say-so.
  const petMention = /\b(dog|puppy|cat|kitten|pet)\b/.test(t);
  if (ctx.profile.relationship === "pet" || petMention) return petMedicine(ctx, found?.canonical_name ?? null, t);
  const babyProfile = ctx.profile.age != null && ctx.profile.age < 2;
  if (/\b(baby|newborn|infant)\b/.test(t) && !babyProfile) return babyMedicine(ctx, found?.canonical_name ?? null);

  if (!found) {
    const meds = await patient.activeMedications();
    const q = meds.length
      ? `Which medicine do you mean? On record for ${ctx.profile.display_name}: ${meds.map((m) => m.name).join(", ")}.`
      : "Which medicine are you asking about? You can type the name as it appears on the strip or bottle.";
    return {
      agent: "MedicationAgent",
      text: q,
      cards: meds.length ? [{ id: cardId(), type: "quick_replies", options: meds.slice(0, 5).map((m) => ({ label: m.name, value: `Tell me about ${m.name}` })) }] : [],
      response: baseResponse(ctx, { intent: "medicine", clarifyingQuestions: [q] }),
    };
  }

  // Uncertain spelling → confirm, never silently change.
  const decision = decideConfidence("medication_name", found.confidence);
  if (!confirmed && found.confidence < 1 && decision !== "accept") {
    const card: ChatCard = {
      id: cardId(),
      type: "medication_confirm",
      original: found.original_text,
      suggestion: found.canonical_name!,
      confidence: found.confidence,
      alternatives: found.possible_matches.slice(1).map((m) => m.canonical_name),
      status: "pending",
    };
    return {
      agent: "MedicationAgent",
      text: `Did you mean ${found.canonical_name}? I want to be sure before giving any information about a medicine.`,
      cards: [card],
      state: { ...ctx.state, lastIntent: "medicine" },
      response: baseResponse(ctx, { intent: "medicine", clarifyingQuestions: [`Did you mean ${found.canonical_name}?`] }),
    };
  }

  const name = found.canonical_name!;
  const classes = drugClassesFor(name);
  const [meds, allergies, conditions, instructions] = await Promise.all([patient.activeMedications(), patient.allergies(), patient.conditions(), patient.doctorInstructions(["medication", name.toLowerCase(), ...classes])]);
  const onRecord = meds.find((m) => m.name.toLowerCase().includes(name.toLowerCase()) || (m.generic_name ?? "").toLowerCase() === name.toLowerCase() || found.possible_matches.some((p) => p.brand_name && m.name.toLowerCase().includes(p.brand_name.toLowerCase())));
  ctx.sources.medications.push({ name });

  const cautions: string[] = [];
  const blocking: string[] = [];
  for (const i of instructions) {
    if (i.instruction_type === "avoid_medicine" && (i.instruction.toLowerCase().includes(name.toLowerCase()) || classes.some((c) => i.instruction.toLowerCase().includes(c.replace(/_/g, " "))) || (classes.includes("nsaid") && /nsaid|painkiller|ibuprofen/i.test(i.instruction)))) {
      blocking.push(`${i.doctor_name} has advised: "${i.instruction}"`);
    }
  }
  for (const a of allergies) {
    const s = a.substance.toLowerCase();
    if (s.includes(name.toLowerCase()) || classes.some((c) => s.includes(c.replace(/_/g, " ")) || c.includes(s))) blocking.push(`There's a recorded allergy to ${a.substance}${a.reaction ? ` (${a.reaction})` : ""}.`);
  }
  for (const m of meds) {
    if (onRecord && m.id === onRecord.id) continue;
    const other = drugClassesFor(m.generic_name ?? m.name);
    for (const ic of INTERACTION_CAUTIONS) {
      if ((classes.includes(ic.a) && other.includes(ic.b)) || (classes.includes(ic.b) && other.includes(ic.a))) cautions.push(`With ${m.name}: ${ic.note}`);
    }
  }
  if (ctx.profile.pregnancy_status === "pregnant") cautions.push("During pregnancy, check every medicine with your doctor before taking it.");
  if (conditions.some((c) => /kidney|ckd|renal/i.test(c.name)) && (classes.includes("nsaid") || name === "Metformin")) cautions.push("Kidney function matters for this medicine; your doctor may need to adjust it.");
  const age = ctx.profile.age;
  if (age != null && age < 12)
    cautions.push(ctx.profile.weight_kg ? `Children's doses depend on weight (${ctx.profile.weight_kg} kg on the profile) and on the medicine's strength — use the child's prescription or the label exactly, and check with a pharmacist if unsure.` : "Children's doses depend on weight and on the medicine's strength (for example 120 mg in 5 mL). Add the child's weight to their profile, and check the dose with your paediatrician or pharmacist — I won't guess one.");
  const childbearing = ctx.profile.sex === "female" && (age == null || (age >= 12 && age <= 55));
  if (/breast ?feed|nursing/.test(t)) cautions.push("While breastfeeding, ask a doctor or pharmacist which medicines are suitable — many are fine, but some pass into breast milk.");
  else if (childbearing && ctx.profile.pregnancy_status !== "pregnant" && ctx.profile.pregnancy_status !== "not_pregnant") cautions.push("If you could be pregnant, are trying to get pregnant or are breastfeeding, check with a doctor or pharmacist first.");
  if (age != null && age >= 65) {
    if (classes.includes("nsaid") && !classes.includes("antiplatelet")) cautions.push("After 65, painkillers like ibuprofen and diclofenac are more likely to cause stomach bleeding and kidney problems. Paracetamol is often a safer first choice — check with the doctor.");
    if (classes.includes("sleep_aid") || classes.includes("antihistamine")) cautions.push("This can cause drowsiness, which raises the risk of falls in older adults.");
    if (meds.length >= 5) cautions.push(`${ctx.profile.relationship === "self" ? "You take" : `${ctx.profile.display_name} takes`} ${meds.length} medicines — a medicines review with the doctor once a year is worthwhile.`);
  }

  const knowledge = await retrieveDoctorKnowledge(ctx.doctor?.id ?? null, `${name} ${classes.join(" ")} medicine guidance dose timing`, ctx.sources, { k: 2 });
  const cards: ChatCard[] = [
    {
      id: cardId(),
      type: "medication_info",
      name,
      onRecord: onRecord ? { strength: onRecord.strength, frequency: onRecord.frequency, instructions: onRecord.instructions, prescribingDoctor: onRecord.prescribing_doctor, reason: onRecord.reason } : null,
      cautions: [...blocking, ...cautions],
    },
  ];
  const guidanceItems = [
    ...instructions.map((i) => ({ kind: "instruction" as const, title: `Instruction (${i.instruction_type.replace(/_/g, " ")})`, text: i.instruction, version: i.version })),
    ...knowledge.map((k) => ({ kind: "knowledge" as const, title: k.title, text: excerpt(k, `${name} take dose timing food`), documentId: k.document_id, version: k.version })),
  ];
  if (guidanceItems.length) cards.push({ id: cardId(), type: "doctor_guidance", doctorName: ctx.doctor?.name ?? "Your doctor", items: guidanceItems });

  const lines: string[] = [];
  // After "Did you mean …?" the real question is the previous user message.
  if (confirmed) {
    const prev = [...ctx.history].reverse().find((m) => m.role === "user");
    if (prev) t = prev.content.toLowerCase();
  }
  const isCanITake = /\bcan (i|she|he|they|mom|dad) take\b|\bis it (ok|okay|safe)\b|\bshould i take\b/.test(t);
  const isWhen = /\bwhen (should|do|to)\b|\bhow (often|much)\b|\bdose\b|\btiming\b/.test(t);
  if (blocking.length) {
    lines.push(`${ctx.profile.relationship === "self" ? `Please don't take ${name}` : `Please don't give ${ctx.profile.display_name} ${name}`} until you've checked with ${ctx.doctor?.name ?? "your doctor"}. ${blocking.join(" ")}`);
  } else if (isWhen) {
    if (onRecord?.frequency || onRecord?.instructions) lines.push(`According to ${ctx.profile.display_name}'s medicine list, ${onRecord.name}${onRecord.strength ? " " + onRecord.strength : ""} is taken ${[onRecord.frequency, onRecord.instructions].filter(Boolean).join(", ")}${onRecord.prescribing_doctor ? ` (prescribed by ${onRecord.prescribing_doctor})` : ""}.`);
    else lines.push(`I don't have dosing instructions for ${name} on record, so I can't tell you a dose. Please follow the prescription or label, or ask your doctor or pharmacist.`);
  } else if (isCanITake) {
    lines.push(`I didn't find a recorded allergy or doctor restriction against ${name}${cautions.length ? ", but there are some points to consider below" : ""}. I can't confirm it's safe for ${ctx.profile.relationship === "self" ? "you" : ctx.profile.display_name} — your doctor or pharmacist should confirm, especially for a new medicine.`);
  } else {
    lines.push(onRecord ? `${name} is on ${ctx.profile.display_name}'s current medicine list${onRecord.reason ? ` for ${onRecord.reason}` : ""}.` : `${name} is a medicine in the ${classes.map((c) => c.replace(/_/g, " ")).join(" / ") || "reference"} group. It isn't on ${ctx.profile.display_name}'s current medicine list.`);
  }
  if (guidanceItems.length) lines.push("Your doctor's guidance is shown below and takes priority over general information.");
  if (cautions.length && !blocking.length) lines.push("This is not a complete interaction check.");

  cards.push({ id: cardId(), type: "actions", actions: [{ label: "Ask doctor", kind: "send_review", variant: blocking.length ? "primary" : "secondary" }, { label: "View medicines", kind: "link", href: `/health/medications?profile=${ctx.profile.id}` }] });
  if (!onRecord && /\b(i('m| am)? (started|taking|on)|started taking|prescribed)\b/.test(t)) {
    cards.push({ id: cardId(), type: "record_proposal", kind: "medication", profileId: ctx.profile.id, profileName: ctx.profile.display_name, label: `Add ${name}${found.strength ? " " + found.strength : ""} to ${ctx.profile.display_name}'s medicines?`, payload: { name, strength: found.strength, form: found.form, originalText: found.original_text, nameConfirmed: true }, status: "pending" });
  }
  return {
    agent: "MedicationAgent",
    text: lines.join(" "),
    cards,
    lockText: blocking.length > 0,
    state: { ...ctx.state, lastIntent: "medicine" },
    response: baseResponse(ctx, {
      intent: "medicine",
      urgency: blocking.length ? "MODERATE" : "LOW",
      summary: `Medicine question about ${name}`,
      recommendations: lines,
      redFlags: blocking,
      doctorReviewRecommended: blocking.length > 0 || isCanITake,
      doctorSpeciality: blocking.length ? "General Practice" : null,
      doctorSources: guidanceItems.map((g) => g.title),
      medicalSources: ["Kinwell medication reference (demo list)"],
    }),
  };
}

/** A baby without their own profile: no doses, and the under-3-months fever rule comes first. */
function babyMedicine(ctx: AgentContext, name: string | null): AgentResult {
  return {
    agent: "MedicationAgent",
    text: `For a baby, whether a medicine${name ? ` like ${name}` : ""} is suitable — and how much — depends on their exact age, weight and the strength of the product, so please check with your paediatrician or pharmacist before giving it. I won't suggest a dose. If the baby is under 3 months, don't give fever medicine unless a doctor has said to: a temperature of 38°C (100.4°F) or higher at that age needs prompt medical assessment.`,
    lockText: true,
    cards: [
      { id: cardId(), type: "care_level", level: "clinician", audience: "human" },
      { id: cardId(), type: "doctor_recommendation", speciality: "Paediatrician", reason: "A Paediatrician can recommend the right medicine and dose for the baby's age and weight.", timing: "soon", profileId: ctx.profile.id, status: "open" },
    ],
    state: { ...ctx.state, lastIntent: "medicine" },
    response: baseResponse(ctx, { intent: "medicine", summary: `Medicine for a baby${name ? `: ${name}` : ""}`, doctorReviewRecommended: true, doctorSpeciality: "Paediatrician" }),
  };
}

/** "Can I give my dog paracetamol?" — the answer for animals is always: ask a vet first. */
async function petMedicine(ctx: AgentContext, name: string | null, t: string): Promise<AgentResult> {
  const pet = ctx.profile.relationship === "pet" ? ctx.profile.display_name : "your pet";
  const given = /\b(gave|given|ate|eaten|swallowed|has had|already)\b/.test(t);
  if (given) return vetEmergencyFromText(ctx, [`Swallowed a human medicine${name ? ` (${name})` : ""}`]);
  const specific = name === "Paracetamol" ? " Paracetamol can be fatal to cats, even in small amounts, and is dangerous for dogs too." : name && /ibuprofen|diclofenac|aspirin/i.test(name) ? ` ${name} can cause stomach bleeding and kidney damage in dogs and cats.` : "";
  return {
    agent: "MedicationAgent",
    text: `Please don't give ${pet} any human medicine${name ? `, including ${name},` : ""} unless a vet has told you to.${specific} Doses and safe medicines for animals are very different from ours. A vet can tell you what's safe for ${pet}'s size and health.`,
    lockText: true,
    cards: [
      { id: cardId(), type: "care_level", level: "clinician", audience: "vet" },
      { id: cardId(), type: "doctor_recommendation", speciality: "Veterinarian", reason: "A vet can recommend a medicine and dose that's safe for your pet.", timing: "routine", profileId: ctx.profile.id, status: "open" },
    ],
    state: { ...ctx.state, lastIntent: "medicine" },
    response: baseResponse(ctx, { intent: "medicine", summary: `Human medicine for a pet${name ? `: ${name}` : ""}`, doctorReviewRecommended: true, doctorSpeciality: "Veterinarian" }),
  };
}

async function doctorRecommendation(ctx: AgentContext, patient: PatientContextService): Promise<AgentResult> {
  const topicWords = ctx.concepts.filter((c) => !c.negated).map((c) => c.code);
  const meds = await patient.activeMedications();
  const instructions = await patient.doctorInstructions(topicWords);
  const notes = await patient.doctorNotes(5);
  const knowledge = await retrieveDoctorKnowledge(ctx.doctor?.id ?? null, `${ctx.message} medicine recommended`, ctx.sources, { k: 3 });
  const relevantMeds = meds.filter((m) => topicWords.some((w) => (m.reason ?? "").toLowerCase().includes(w.replace(/_/g, " "))) || (m.reason && ctx.message.toLowerCase().includes(m.reason.toLowerCase())));
  const relevantNotes = notes.filter((n) => topicWords.some((w) => n.note.toLowerCase().includes(w.replace(/_/g, " "))) || /medicine|tablet|take/i.test(n.note));
  const items = [
    ...instructions.map((i) => ({ kind: "instruction" as const, title: `Instruction for ${ctx.profile.display_name}`, text: i.instruction, version: i.version })),
    ...relevantNotes.map((n) => ({ kind: "note" as const, title: `Note from ${n.doctor_name}`, text: n.note, date: new Date(n.created_at).toISOString() })),
    ...knowledge.map((k) => ({ kind: "knowledge" as const, title: k.title, text: excerpt(k, ctx.message), documentId: k.document_id, version: k.version })),
  ];
  const cards: ChatCard[] = [];
  const lines: string[] = [];
  if (relevantMeds.length) lines.push(`On ${ctx.profile.display_name}'s medicine list: ${relevantMeds.map((m) => `${m.name}${m.strength ? " " + m.strength : ""}${m.prescribing_doctor ? ` (prescribed by ${m.prescribing_doctor})` : ""}`).join("; ")}.`);
  if (items.length) {
    cards.push({ id: cardId(), type: "doctor_guidance", doctorName: ctx.doctor?.name ?? "Your doctor", items });
    lines.push(`Here's what ${ctx.doctor?.name ?? "your doctor"} has provided that relates to this. I've quoted it rather than summarising so nothing changes in translation.`);
  }
  if (!items.length && !relevantMeds.length) lines.push("I couldn't find a recommendation from your doctor about this in the records or your doctor's guidance. I won't guess a medicine — would you like to ask your doctor directly?");
  cards.push({ id: cardId(), type: "actions", actions: [{ label: "Ask doctor", kind: "send_review", variant: items.length ? "secondary" : "primary" }] });
  return {
    agent: "MedicationAgent",
    text: lines.join(" "),
    cards,
    state: { ...ctx.state, lastIntent: "medicine" },
    response: baseResponse(ctx, { intent: "medicine", summary: "Doctor-recommended medicine lookup", doctorSources: items.map((i) => i.title), doctorReviewRecommended: !items.length }),
  };
}
