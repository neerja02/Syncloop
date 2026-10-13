/**
 * Veterinary mode for companion animals.
 *
 * Escalates urgent signs (Merck Veterinary Manual: breathing difficulty, collapse, ongoing seizures, major
 * bleeding, poisoning, heatstroke, inability to urinate, severe abdominal swelling or unproductive retching…)
 * and never suggests human medicines. Demo content — requires veterinary review.
 */
import type { GuidedState, QuestionDef, StructuredAnswer } from "./types";
import type { Decision } from "./symptom-engine";

const opt = (label: string, value: string, extra: Partial<{ reply: string; exclusive: boolean }> = {}) => ({ label, value, ...extra });
const NONE = { label: "None of these", value: "none", exclusive: true };
const has = (s: GuidedState, key: string, v: string) => (s.answers[key] ?? "").split("|").includes(v);

export const SPECIES_OPTIONS = [opt("Dog", "dog"), opt("Cat", "cat"), opt("Rabbit", "rabbit"), opt("Bird", "bird"), opt("Other", "other")];

export function petSpeciesQuestion(): QuestionDef {
  return { key: "pet_species", text: "What kind of animal is it?", style: "chips", options: SPECIES_OPTIONS };
}

export function petCategoryQuestion(name: string): QuestionDef {
  return {
    key: "pet_category",
    text: `What's going on with ${name}?`,
    style: "symptoms",
    options: [
      opt("Not eating", "not_eating"),
      opt("Vomiting", "vomiting"),
      opt("Diarrhoea", "diarrhoea"),
      opt("Breathing problem", "breathing"),
      opt("Ate something harmful", "poison"),
      opt("Injury or bleeding", "injury"),
      opt("Straining to pee", "urine"),
      opt("Skin or ear problem", "skin"),
      opt("Limping", "limping"),
      opt("Low energy", "lethargy"),
      opt("Something else", "other"),
    ],
    allowText: true,
    textPlaceholder: "Describe it in a few words",
  };
}

export function applyVetAnswer(prev: GuidedState, a: StructuredAnswer): GuidedState {
  const s: GuidedState = { ...prev, answers: { ...prev.answers, [a.key]: a.value }, asked: prev.asked.includes(a.key) ? prev.asked : [...prev.asked, a.key], pending: null };
  if (a.key === "pet_species") s.patient = { ...(s.patient ?? { kind: "pet", label: "your pet", saved: false }), species: a.value };
  if (a.key === "pet_category") s.symptomType = a.value;
  if (a.key === "pet_duration") s.onset = a.value;
  return s;
}

const species = (s: GuidedState) => s.patient?.species ?? "dog";

export function vetScreen(s: GuidedState): { level: "emergency" | "urgent"; reasons: string[] } | null {
  const e: string[] = [];
  const u: string[] = [];
  for (const [v, label] of [
    ["breathing", "Breathing difficulty"],
    ["gums", "Pale, blue or grey gums"],
    ["collapse", "Collapsed, fainted or can't stand"],
    ["seizure", "A seizure that won't stop, or several seizures"],
    ["bleeding", "Heavy bleeding"],
    ["bloat", "A swollen, hard belly or retching with nothing coming up"],
    ["heat", "Signs of heatstroke"],
  ] as const)
    if (has(s, "pet_danger", v)) e.push(label);
  if (s.symptomType === "poison" && s.answers.pet_toxin) e.push("Possible poisoning — contact a vet or animal poison service now. Don't make your pet vomit unless a vet tells you to.");
  if (s.symptomType === "urine" && s.answers.pet_urine === "none") (species(s) === "cat" ? e : u).push(species(s) === "cat" ? "A cat straining with little or no urine" : "Straining with little or no urine");
  if (s.answers.pet_vomit_count === "many" || has(s, "pet_extra", "blood")) u.push(s.answers.pet_vomit_count === "many" ? "Vomiting many times" : "Blood in vomit or stool");
  if (s.answers.pet_water === "none") u.push("Not drinking");
  if (s.answers.pet_energy === "very_low") u.push("Very low energy");
  if (s.symptomType === "not_eating" && species(s) === "cat" && s.onset && s.onset !== "under_day") u.push("A cat that hasn't eaten for more than a day");
  if (s.symptomType === "not_eating" && species(s) !== "cat" && s.onset === "over_2_days") u.push("Not eating for more than 2 days");
  if (s.symptomType === "limping" && s.answers.pet_weight_bearing === "no") u.push("Can't put weight on the leg");
  if (s.symptomType === "injury" && s.answers.pet_wound === "deep") u.push("A deep wound");
  if (e.length) return { level: "emergency", reasons: e };
  if (u.length) return { level: "urgent", reasons: u };
  return null;
}

export function vetNextQuestion(s: GuidedState, name: string): QuestionDef | null {
  const asked = (k: string) => s.answers[k] != null;
  if (!s.patient?.species) return petSpeciesQuestion();
  if (!s.symptomType) return petCategoryQuestion(name);
  if (!asked("pet_danger"))
    return {
      key: "pet_danger",
      text: `First, is ${name} showing any of these right now?`,
      style: "multi",
      options: [opt("Breathing difficulty", "breathing"), opt("Pale, blue or grey gums", "gums"), opt("Collapsed or can't stand", "collapse"), opt("A seizure that won't stop", "seizure"), opt("Heavy bleeding", "bleeding"), opt("Swollen, hard belly or retching with nothing coming up", "bloat"), opt("Overheated, panting heavily", "heat"), NONE],
    };
  const t = s.symptomType;
  if (t === "poison" && !asked("pet_toxin"))
    return { key: "pet_toxin", text: "What might they have eaten?", style: "chips", options: [opt("Chocolate", "chocolate"), opt("Grapes or raisins", "grapes"), opt("Human medicine", "medicine"), opt("Rat or insect poison", "rodenticide"), opt("Sugar-free gum (xylitol)", "xylitol"), opt("Plants", "plants"), opt("Chemicals", "chemicals"), opt("Not sure", "unknown")] };
  if (t === "urine" && !asked("pet_urine"))
    return { key: "pet_urine", text: "Is any urine coming out?", style: "chips", options: [opt("Yes, normal amounts", "normal"), opt("Only small drops", "drops"), opt("None at all", "none")] };
  if (["not_eating", "vomiting", "diarrhoea", "lethargy", "other", "skin"].includes(t) && !s.onset)
    return { key: "pet_duration", text: "How long has this been going on?", style: "duration", options: [opt("Less than a day", "under_day"), opt("1–2 days", "1_2_days"), opt("More than 2 days", "over_2_days")] };
  if (t === "vomiting" && !asked("pet_vomit_count"))
    return { key: "pet_vomit_count", text: "How many times today?", style: "chips", options: [opt("Once", "once"), opt("2–3 times", "few"), opt("More than 3 times", "many")] };
  if (["not_eating", "vomiting", "diarrhoea", "lethargy"].includes(t) && !asked("pet_water"))
    return { key: "pet_water", text: "Is your pet drinking water?", style: "chips", options: [opt("Yes, normally", "normal"), opt("Less than usual", "less"), opt("Not at all", "none")] };
  if (["not_eating", "vomiting", "diarrhoea"].includes(t) && !asked("pet_energy"))
    return { key: "pet_energy", text: "How is their energy?", style: "chips", options: [opt("Normal", "normal"), opt("A bit quiet", "quiet"), opt("Very low", "very_low")] };
  if (["vomiting", "diarrhoea"].includes(t) && !asked("pet_extra"))
    return { key: "pet_extra", text: "Any of these?", style: "multi", options: [opt("Blood in vomit or stool", "blood"), opt("Might have swallowed a toy, bone or object", "object"), NONE] };
  if (t === "skin" && !asked("pet_skin_signs"))
    return {
      key: "pet_skin_signs",
      text: `What have you noticed? Choose all that apply.`,
      style: "multi",
      options: [opt("Scratching or rubbing", "scratching"), opt("Shaking the head", "head_shaking"), opt("Discharge", "discharge"), opt("A bad smell", "smell"), opt("Painful to touch", "pain"), opt("Other pets have it too", "others"), NONE],
    };
  if (t === "limping" && !asked("pet_weight_bearing"))
    return { key: "pet_weight_bearing", text: "Can they put weight on the leg?", style: "yesno", options: [opt("Yes", "yes"), opt("No", "no")] };
  if (t === "injury" && !asked("pet_wound"))
    return { key: "pet_wound", text: "How does the wound look?", style: "chips", options: [opt("A small scrape", "minor"), opt("Deep or gaping", "deep"), opt("Swollen or oozing", "infected")] };
  return null;
}

export function vetDecide(s: GuidedState, name: string): Decision {
  const flag = vetScreen(s);
  if (flag) return { kind: "escalate", ...flag };
  const q = vetNextQuestion(s, name);
  if (q) return { kind: "ask", question: q };
  const t = s.symptomType ?? "other";
  const lasting = s.onset === "1_2_days" || s.onset === "over_2_days";
  const objects = has(s, "pet_extra", "object");
  const needsVet = lasting || objects || ["breathing", "injury", "urine", "skin", "limping", "other"].includes(t) || s.answers.pet_water === "less" || s.answers.pet_energy === "quiet";
  const reason = objects ? "they may have swallowed an object" : lasting ? "it has lasted more than a day" : t === "skin" ? "skin and ear problems usually need a vet to look and test" : "a vet can examine them properly";
  const sp = species(s);
  return {
    kind: "complete",
    outcome: {
      level: needsVet ? "routine" : "self_care",
      speciality: needsVet ? "Veterinarian" : null,
      timing: objects ? "soon" : "routine",
      headline: needsVet
        ? `Based on what you've told me, I didn't find the emergency signs I checked for, but because ${reason}, please book a visit with a vet${objects ? " today or tomorrow" : ""}.`
        : `Based on what you've told me, I didn't find the emergency signs I checked for. You can keep a close eye on ${name} at home for now, and see a vet if it doesn't settle within a day.`,
      reason: "A vet can examine your pet and decide whether any tests or treatment are needed.",
      summary: [],
      selfCare: [
        "Don't give any human medicine — paracetamol and ibuprofen can be dangerous for pets",
        t === "vomiting" || t === "diarrhoea" ? "Keep fresh water available in small amounts; ask your vet before withholding food" : "Keep fresh water available",
        sp === "cat" ? "Cats shouldn't go without food for long — see a vet if your cat still isn't eating tomorrow" : "Let them rest somewhere quiet and comfortable",
        "Note what they eat, drink, and pass, so you can tell the vet",
      ],
      watchFor: ["Breathing difficulty, or pale, blue or grey gums", "Collapse or seizures", "Swollen belly or retching with nothing coming up", "Not drinking, or not passing urine", "Blood in vomit or stool"],
    },
  };
}
