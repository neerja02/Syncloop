/**
 * General health education used as PRIORITY 4 ("approved clinical reference") content.
 * It is written to be calm, non-diagnostic and conservative. In production this content must be reviewed and
 * versioned by the clinical team (or replaced by a licensed reference service through ClinicalRetrievalService).
 */
export interface ReferenceTopic {
  code: string;
  title: string;
  /** Questions in order of clinical value. The illness agent asks one or two at a time. */
  questions: { key: string; text: string; quickReplies?: string[] }[];
  overview: string;
  commonCauses: string[];
  selfCare: string[];
  seekHelp: string[];
  contactDoctorWhen: string;
  speciality: string;
  reviewThresholdDays: number;
}

export const REFERENCE_VERSION = "kinwell-reference-2026.09 (demo — requires clinical review)";

export const REFERENCE_TOPICS: Record<string, ReferenceTopic> = {
  fever: {
    code: "fever",
    title: "Fever",
    questions: [
      { key: "temperature", text: "What's the highest temperature you've measured, and how many days has it lasted?" },
      { key: "red_flags", text: "Is there a rash that doesn't fade when pressed, a stiff neck, difficulty breathing, confusion or unusual drowsiness?", quickReplies: ["None of these", "Yes, one of these"] },
      { key: "fluids", text: "Are they drinking fluids and passing urine about as usual?", quickReplies: ["Yes", "Less than usual"] },
    ],
    overview: "A fever is usually the body's response to an infection, most often a viral one that settles on its own within a few days.",
    commonCauses: ["Viral infections such as colds and flu", "Throat, ear, chest or urine infections", "After some vaccinations"],
    selfCare: ["Rest and drink plenty of fluids", "Wear light clothing and keep the room comfortably cool", "Paracetamol can ease discomfort if it's suitable for you — follow the label or your doctor's advice", "Recheck the temperature and note how you feel"],
    seekHelp: ["Difficulty breathing", "A rash that doesn't fade under a glass", "Stiff neck, severe headache, confusion or unusual drowsiness", "Signs of dehydration (very little urine, dizziness)", "A fever in a baby under 3 months"],
    contactDoctorWhen: "Contact your doctor if the fever lasts more than 3 days, keeps returning, or if you have a long-term condition, are pregnant, or are caring for a young child or older adult.",
    speciality: "General Practice",
    reviewThresholdDays: 3,
  },
  cough: {
    code: "cough",
    title: "Cough",
    questions: [
      { key: "duration", text: "How long has the cough been going on?", quickReplies: ["1–3 days", "4–7 days", "1–3 weeks", "Longer"] },
      { key: "associated", text: "Is there any fever, breathlessness, wheezing or chest pain with it?", quickReplies: ["None", "Fever", "Breathless or wheezy", "Chest pain"] },
      { key: "character", text: "Is the cough dry, or bringing up phlegm? Any blood?", quickReplies: ["Dry", "Phlegm", "Blood"] },
    ],
    overview: "Most coughs are caused by viral infections and improve within 2–3 weeks.",
    commonCauses: ["Common cold or flu", "Post-nasal drip or allergies", "Irritants such as smoke or poor air quality", "Asthma or reflux in some people"],
    selfCare: ["Warm drinks, honey and lemon (not for babies under 1 year)", "Rest and stay hydrated", "Avoid smoke and dusty air", "Steam inhalation may ease congestion — take care with hot water"],
    seekHelp: ["Breathlessness at rest or lips turning blue", "Coughing up blood", "Chest pain", "High fever with feeling very unwell"],
    contactDoctorWhen: "Contact your doctor if the cough lasts more than 3 weeks, keeps getting worse, or comes with weight loss, night sweats or breathlessness.",
    speciality: "General Practice",
    reviewThresholdDays: 21,
  },
  headache: {
    code: "headache",
    title: "Headache",
    questions: [
      { key: "onset", text: "When did it start, and how strong is it on a scale of 1–10?" },
      { key: "red_flags", text: "Was it sudden and severe, or is there fever, stiff neck, vision changes, weakness, confusion or a recent head injury?", quickReplies: ["None of these", "Yes, one of these"] },
      { key: "triggers", text: "Have you had enough water, food and sleep today? Any screen-heavy work or stress?", quickReplies: ["Probably not", "Yes, all fine"] },
    ],
    overview: "Most headaches are tension-type or related to dehydration, poor sleep, missed meals, eye strain or stress.",
    commonCauses: ["Tension and stress", "Dehydration or missed meals", "Poor sleep", "Eye strain from screens", "Migraine"],
    selfCare: ["Drink water and have a light snack if you've missed a meal", "Rest in a quiet, dim room", "Take short screen breaks", "A simple pain reliever may help if suitable for you — avoid using them more than a few days a week"],
    seekHelp: ["Sudden, very severe headache ('worst ever')", "Headache with fever and stiff neck", "Weakness, numbness, confusion or trouble speaking", "Headache after a head injury"],
    contactDoctorWhen: "Contact your doctor if headaches are frequent, getting worse, wake you from sleep, or you need pain relief on many days each month.",
    speciality: "General Practice",
    reviewThresholdDays: 7,
  },
  sore_throat: {
    code: "sore_throat",
    title: "Sore throat",
    questions: [
      { key: "duration", text: "How many days has it been sore, and is there a fever?" },
      { key: "red_flags", text: "Any difficulty swallowing saliva, breathing, or opening the mouth?", quickReplies: ["No", "Yes"] },
    ],
    overview: "Sore throats are usually viral and improve within a week.",
    commonCauses: ["Viral infections", "Bacterial throat infection (less common)", "Dry air or shouting"],
    selfCare: ["Warm salt-water gargles (adults)", "Warm drinks, rest and fluids", "Lozenges for older children and adults"],
    seekHelp: ["Difficulty breathing or swallowing saliva", "Drooling or a muffled voice", "Severe one-sided pain"],
    contactDoctorWhen: "Contact your doctor if it lasts more than a week, is very painful with high fever, or keeps coming back.",
    speciality: "General Practice",
    reviewThresholdDays: 7,
  },
  cold_flu: {
    code: "cold_flu",
    title: "Cold and flu",
    questions: [{ key: "duration", text: "How many days have the symptoms lasted, and is there a fever or body ache?" }],
    overview: "Colds and flu are viral and usually get better on their own. Flu tends to come on faster with fever and aches.",
    commonCauses: ["Respiratory viruses"],
    selfCare: ["Rest, fluids and warm drinks", "Saline nasal rinse may help congestion", "Wash hands often to protect others"],
    seekHelp: ["Breathing difficulty", "Chest pain", "Confusion", "Symptoms that improve then get much worse"],
    contactDoctorWhen: "Contact your doctor if symptoms last more than 10 days or you have a long-term condition such as diabetes, heart or lung disease.",
    speciality: "General Practice",
    reviewThresholdDays: 10,
  },
  vomiting: {
    code: "vomiting",
    title: "Vomiting",
    questions: [
      { key: "frequency", text: "How many times, and can fluids be kept down?", quickReplies: ["Keeping fluids down", "Can't keep fluids down"] },
      { key: "red_flags", text: "Any blood, severe tummy pain, very little urine, or drowsiness?", quickReplies: ["None", "Yes"] },
    ],
    overview: "Vomiting is often due to a stomach bug and usually settles within 1–2 days.",
    commonCauses: ["Stomach infections", "Food poisoning", "Motion sickness", "Some medicines"],
    selfCare: ["Small, frequent sips of water or oral rehydration solution", "Bland food once vomiting settles", "Rest"],
    seekHelp: ["Can't keep any fluids down for many hours", "Blood or 'coffee grounds' in vomit", "Severe abdominal pain", "Signs of dehydration"],
    contactDoctorWhen: "Contact your doctor if vomiting lasts more than 2 days, or sooner for babies, older adults, pregnancy, or people with diabetes.",
    speciality: "General Practice",
    reviewThresholdDays: 2,
  },
  diarrhoea: {
    code: "diarrhoea",
    title: "Diarrhoea",
    questions: [{ key: "frequency", text: "How long has it lasted, and is there blood, fever or signs of dehydration?" }],
    overview: "Most diarrhoea is caused by infections and improves within a few days.",
    commonCauses: ["Stomach infections", "Food intolerance", "Some medicines"],
    selfCare: ["Oral rehydration solution and fluids", "Continue eating light meals", "Wash hands carefully"],
    seekHelp: ["Blood in stool", "Signs of dehydration", "Severe abdominal pain", "High fever"],
    contactDoctorWhen: "Contact your doctor if it lasts more than 3 days (1 day in young children), or if you have a long-term condition.",
    speciality: "General Practice",
    reviewThresholdDays: 3,
  },
  dizziness: {
    code: "dizziness",
    title: "Dizziness",
    questions: [
      { key: "type", text: "Does it feel like the room is spinning, or more like feeling faint or light-headed?", quickReplies: ["Room spinning", "Light-headed"] },
      { key: "red_flags", text: "Any fainting, chest pain, palpitations, weakness, or trouble speaking?", quickReplies: ["None", "Yes"] },
    ],
    overview: "Dizziness has many causes, including standing up quickly, dehydration, low blood sugar, inner-ear problems or some medicines.",
    commonCauses: ["Dehydration", "Standing up quickly", "Inner-ear problems", "Low blood sugar", "Medicine side effects"],
    selfCare: ["Sit or lie down until it passes", "Drink water", "Stand up slowly", "If you have diabetes, check your blood sugar"],
    seekHelp: ["Fainting", "Chest pain or palpitations", "Weakness, numbness or trouble speaking"],
    contactDoctorWhen: "Contact your doctor if dizziness keeps happening or started after a new medicine.",
    speciality: "General Practice",
    reviewThresholdDays: 3,
  },
  abdominal_pain: {
    code: "abdominal_pain",
    title: "Abdominal pain",
    questions: [
      { key: "location", text: "Where is the pain, how strong is it (1–10), and how long has it been there?" },
      { key: "red_flags", text: "Is it severe and constant, or with vomiting, fever, blood, or pain in the lower right side?", quickReplies: ["None", "Yes"] },
    ],
    overview: "Tummy pain is common and often related to indigestion, wind, constipation or a stomach bug.",
    commonCauses: ["Indigestion", "Constipation", "Stomach infections", "Period pain"],
    selfCare: ["Rest and sip water", "Light meals", "A warm compress may help cramps"],
    seekHelp: ["Severe or worsening pain", "Pain with persistent vomiting or fever", "Blood in vomit or stool", "Swollen, hard tummy"],
    contactDoctorWhen: "Contact your doctor if pain lasts more than a day or two or keeps coming back.",
    speciality: "General Practice",
    reviewThresholdDays: 2,
  },
  back_pain: {
    code: "back_pain",
    title: "Back pain",
    questions: [{ key: "detail", text: "How long has it hurt, and is there any numbness, leg weakness, or problems passing urine?" }],
    overview: "Most back pain is muscular and improves within a few weeks with gentle movement.",
    commonCauses: ["Muscle strain", "Posture", "Lifting"],
    selfCare: ["Keep gently active", "Heat packs", "Short walks and stretching"],
    seekHelp: ["Numbness around the bottom or genitals", "Leg weakness", "Loss of bladder or bowel control", "Back pain with fever"],
    contactDoctorWhen: "Contact your doctor if it isn't improving after 2–3 weeks.",
    speciality: "General Practice",
    reviewThresholdDays: 14,
  },
  rash: {
    code: "rash",
    title: "Rash",
    questions: [{ key: "detail", text: "Where is the rash, is it itchy or painful, and does it fade when pressed with a glass?" }],
    overview: "Rashes are common and often caused by irritation, allergy or viral infections.",
    commonCauses: ["Skin irritation", "Allergic reactions", "Viral infections", "Eczema"],
    selfCare: ["Avoid scratching", "Use a gentle moisturiser", "Avoid new soaps or products that may have triggered it"],
    seekHelp: ["Rash that doesn't fade under a glass", "Swelling of lips, tongue or throat", "Rash with fever and feeling very unwell"],
    contactDoctorWhen: "Contact your doctor if the rash spreads, blisters, or lasts more than a week.",
    speciality: "Dermatology",
    reviewThresholdDays: 7,
  },
  fatigue: {
    code: "fatigue",
    title: "Tiredness",
    questions: [{ key: "sleep", text: "Was your sleep shorter than usual, or are you feeling weak even after sleeping normally?", quickReplies: ["Short sleep", "Slept normally"] }],
    overview: "Tiredness is very common and usually linked to sleep, stress, activity or diet.",
    commonCauses: ["Short or poor sleep", "Stress", "Busy schedule", "Not eating regularly", "Sometimes anaemia, thyroid or blood sugar problems"],
    selfCare: ["Aim for a regular sleep schedule", "Get daylight and gentle movement", "Eat regular balanced meals"],
    seekHelp: ["Tiredness with breathlessness or chest pain", "Unexplained weight loss"],
    contactDoctorWhen: "Contact your doctor if tiredness lasts more than a few weeks without an obvious reason.",
    speciality: "General Practice",
    reviewThresholdDays: 21,
  },
  palpitations: {
    code: "palpitations",
    title: "Palpitations",
    questions: [{ key: "detail", text: "How long do the episodes last, and is there chest pain, breathlessness or fainting with them?", quickReplies: ["Brief, nothing else", "With other symptoms"] }],
    overview: "Palpitations are often harmless and can be triggered by caffeine, stress or dehydration, but some need a check-up.",
    commonCauses: ["Caffeine", "Stress or anxiety", "Dehydration", "Some medicines", "Heart rhythm problems"],
    selfCare: ["Sit and breathe slowly", "Reduce caffeine", "Stay hydrated"],
    seekHelp: ["Chest pain", "Breathlessness", "Fainting or near-fainting"],
    contactDoctorWhen: "Contact your doctor if palpitations are frequent or new.",
    speciality: "Cardiology",
    reviewThresholdDays: 1,
  },
};

export const LIFESTYLE_GUIDANCE = {
  sleep: {
    title: "Sleep",
    questions: [{ key: "pattern", text: "Is it hard to fall asleep, are you waking up in the night, or waking too early?", quickReplies: ["Falling asleep", "Waking at night", "Waking too early"] }],
    tips: ["Keep a regular wake-up time, even on weekends", "Dim screens and lights for an hour before bed", "Avoid caffeine after early afternoon", "Keep the bedroom cool, dark and quiet", "If you can't sleep after ~20 minutes, get up and do something calm until sleepy"],
    seekHelp: "Talk to your doctor if poor sleep lasts more than a few weeks, you snore loudly with pauses in breathing, or low mood is affecting your sleep.",
  },
  exercise: {
    title: "Exercise",
    tips: ["Most adults benefit from about 150 minutes of moderate activity a week, such as brisk walking", "Start gently and build up gradually", "Include strength exercises twice a week", "Warm up and cool down"],
    seekHelp: "Stop and seek advice if you get chest pain, unusual breathlessness, dizziness or palpitations during exercise.",
  },
  nutrition: {
    title: "Nutrition",
    tips: ["Fill half the plate with vegetables", "Choose whole grains and pulses over refined carbs", "Include protein at each meal", "Limit sugary drinks and fried snacks", "Drink water regularly"],
    seekHelp: "A dietitian or your doctor can tailor advice if you have diabetes, kidney disease or other conditions.",
  },
  stress: {
    title: "Stress and wellbeing",
    tips: ["Try slow breathing: in for 4, out for 6, for two minutes", "Take a short walk outside", "Talk to someone you trust", "Keep regular sleep and meals", "Limit news and social media if they make you feel worse"],
    seekHelp: "If low mood or anxiety lasts more than two weeks or affects daily life, please talk to your doctor. If you ever feel unsafe, seek urgent help.",
  },
};
