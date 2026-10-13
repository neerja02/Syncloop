/**
 * Kinwell health knowledge: the 26-domain coverage taxonomy.
 *
 * Each symptom lists its everyday English wording, Hindi/Punjabi/Hinglish variants, and which guided check
 * handles it ("fever", or "pain:knee" for a body area). Symptoms without a guided check yet ("-") still get
 * safe general guidance, the domain's warning signs and the right type of specialist.
 *
 * This is the source of truth for the knowledge tables; `syncKnowledge` writes it to the database with
 * versions and review status. Everything here is demo content pending clinical review. References are
 * publisher-level pointers (real organisations and their health libraries) — specific pages are to be chosen
 * during clinical review; none are invented.
 */

export interface KnowledgeReference {
  code: string;
  title: string;
  publisher: string;
  url: string;
}

export interface KnowledgeSymptom {
  code: string;
  name: string;
  synonyms: string[];
  variants: string[];
  flow: string | null;
}

export interface KnowledgeDomain {
  code: string;
  number: number;
  name: string;
  education: string;
  warningSigns: string[];
  specialties: string[];
  references: string[];
  symptoms: KnowledgeSymptom[];
}

export const REFERENCES: KnowledgeReference[] = [
  { code: "nhs", title: "Health A to Z", publisher: "NHS (England)", url: "https://www.nhs.uk/conditions/" },
  { code: "medlineplus", title: "MedlinePlus Health Topics", publisher: "U.S. National Library of Medicine", url: "https://medlineplus.gov/healthtopics.html" },
  { code: "nice_cks", title: "Clinical Knowledge Summaries", publisher: "NICE", url: "https://cks.nice.org.uk/" },
  { code: "who", title: "Fact sheets", publisher: "World Health Organization", url: "https://www.who.int/news-room/fact-sheets" },
  { code: "aap", title: "HealthyChildren.org", publisher: "American Academy of Pediatrics", url: "https://www.healthychildren.org/" },
  { code: "telemanas", title: "Tele-MANAS", publisher: "Ministry of Health and Family Welfare, Government of India", url: "https://telemanas.mohfw.gov.in/" },
  { code: "ncvbdc", title: "National Center for Vector Borne Diseases Control", publisher: "Government of India", url: "https://ncvbdc.mohfw.gov.in/" },
];

/** "code | Name | english, synonyms | local, variants | flow" — one symptom per line. */
function S(block: string): KnowledgeSymptom[] {
  return block
    .trim()
    .split("\n")
    .map((line) => line.split("|").map((x) => x.trim()))
    .map(([code, name, synonyms, variants, flow]) => ({
      code: code!,
      name: name!,
      synonyms: synonyms ? synonyms.split(",").map((x) => x.trim()).filter(Boolean) : [],
      variants: variants ? variants.split(",").map((x) => x.trim()).filter(Boolean) : [],
      flow: !flow || flow === "-" ? null : flow,
    }));
}

const GP = "General Physician";

export const DOMAINS: KnowledgeDomain[] = [
  {
    code: "general", number: 1, name: "General health",
    education: "Fever, tiredness and feeling unwell are usually caused by common infections or not enough rest, food or fluids, but they can be the first sign of something that needs checking if they last or come with other symptoms.",
    warningSigns: ["Confusion or being very hard to wake", "Difficulty breathing", "Not passing urine all day", "A rash that doesn't fade when pressed"],
    specialties: [GP], references: ["nhs", "medlineplus"],
    symptoms: S(`
fever | Fever | fever, feverish, high temperature, chills, shivering | bukhar, taap | fever
fatigue | Tiredness | tired, exhausted, no energy, low energy, fatigue | thakan, kamzori | weakness
body_aches | Body aches | body aches, aching all over, whole body hurts | badan dard, sharir dard | weakness
dizziness | Dizziness | dizzy, lightheaded, giddy | chakkar | other:dizziness
fainting | Fainting | fainted, passed out, blacked out | behosh, behoshi | weakness
weight_loss | Unexplained weight loss | losing weight, weight loss without trying | vajan kam | -
thirst | Excessive thirst | very thirsty, always thirsty, dry mouth | bahut pyaas | -
night_sweats | Night sweats | night sweats, sweating at night | raat ko pasina | -
`),
  },
  {
    code: "neuro", number: 2, name: "Head, brain and nerves",
    education: "Most headaches are tension-type or migraine. Sudden severe headache, weakness, speech changes or a drooping face are different and need emergency care.",
    warningSigns: ["A sudden, extremely severe headache", "Weakness or numbness on one side, slurred speech or a drooping face", "A seizure", "Confusion after a head injury"],
    specialties: ["Neurologist", GP], references: ["nhs", "nice_cks"],
    symptoms: S(`
headache | Headache | headache, head hurts, head is pounding, heavy head, head feels heavy | sir dard, sar dard | headache
migraine | Migraine | migraine | adha sir dard | headache
vertigo | Vertigo | vertigo, room spinning | chakkar | other:dizziness
seizure | Seizure | seizure, convulsion, having a fit | daura, mirgi | -
numbness | Numbness or tingling | numb, numbness, tingling, pins and needles | sunn, jhunjhuni | -
tremor | Tremor | shaking hands, tremor, trembling | haath kaanpna | -
memory | Memory problems | forgetful, memory loss, can't remember | bhoolna | -
head_injury | Head injury | hit my head, head injury, bumped head | sir pe chot | fall
`),
  },
  {
    code: "eyes", number: 3, name: "Eyes and vision",
    education: "Red, itchy or watery eyes are usually from allergy or infection. Pain, light sensitivity, or any sudden change in vision needs an eye examination.",
    warningSigns: ["Sudden loss or blurring of vision", "Chemicals or an injury to the eye", "Flashes, new floaters or a curtain over vision", "Severe eye pain with headache or vomiting"],
    specialties: ["Ophthalmologist"], references: ["nhs", "medlineplus"],
    symptoms: S(`
red_eye | Red eye | red eye, pink eye, bloodshot | aankh laal | eye
eye_pain | Eye pain | eye pain, eye hurts, sore eye | aankh mein dard | eye
blurred_vision | Blurred vision | blurred vision, blurry, can't see clearly | dhundhla | eye
itchy_eyes | Itchy or watery eyes | itchy eyes, watery eyes, watering | aankh mein khujli | eye
floaters | Floaters or flashes | floaters, flashes of light, spots in vision | - | eye
double_vision | Double vision | double vision, seeing double | do do dikhna | -
`),
  },
  {
    code: "ent", number: 4, name: "Ears, nose and throat",
    education: "Most sore throats, blocked noses and earaches come from viral infections and settle within a week or two.",
    warningSigns: ["Difficulty breathing or can't swallow saliva", "Sudden hearing loss", "A nosebleed that won't stop", "Swelling around the eye or behind the ear"],
    specialties: ["ENT Specialist", GP], references: ["nhs", "nice_cks"],
    symptoms: S(`
earache | Earache | earache, ear pain, ear hurts | kaan mein dard | ent
tinnitus | Ringing in the ears | tinnitus, ringing in my ears, buzzing in ears | kaan bajna | ent
hearing_loss | Hearing loss | can't hear, hearing loss, muffled hearing | kam sunai dena | ent
blocked_nose | Blocked nose or sinus pain | blocked nose, stuffy nose, sinus, sinusitis | naak band | ent
nosebleed | Nosebleed | nosebleed, nose bleeding, bleeding nose | naak se khoon, naksir | ent
sore_throat | Sore throat | sore throat, throat pain, painful swallowing | gala dard, gale mein dard | ent
hoarse_voice | Hoarse voice | hoarse, lost my voice, voice change | awaaz baith gayi | ent
`),
  },
  {
    code: "mouth", number: 5, name: "Mouth, teeth and jaw",
    education: "Tooth and gum pain usually needs a dentist to treat the cause. Mouth ulcers normally heal within two weeks.",
    warningSigns: ["Facial swelling spreading to the eye or neck", "Trouble swallowing or breathing", "A mouth ulcer or patch that hasn't healed in 3 weeks"],
    specialties: ["Dentist"], references: ["nhs"],
    symptoms: S(`
toothache | Toothache | toothache, tooth pain, tooth hurts | daant dard, daant mein dard | dental
bleeding_gums | Bleeding gums | bleeding gums, gums bleed, swollen gums | masoodon se khoon | dental
mouth_ulcer | Mouth ulcer | mouth ulcer, ulcer in mouth, mouth sore | chhale, munh mein chhale | dental
jaw_pain | Jaw pain | jaw pain, jaw clicking, jaw hurts | jabde mein dard | dental
sensitive_teeth | Sensitive teeth | sensitive teeth, teeth sensitivity | daant mein jhanjhanahat | dental
`),
  },
  {
    code: "spine", number: 6, name: "Neck, back and spine",
    education: "Most neck and back pain comes from muscles and posture and improves within a few weeks with gentle movement.",
    warningSigns: ["Loss of bladder or bowel control, or numbness between the legs", "Weakness or numbness in the legs or arms", "Back pain with fever", "Pain after a serious fall or accident"],
    specialties: ["Orthopaedic Doctor", "Physiotherapist"], references: ["nhs", "nice_cks"],
    symptoms: S(`
neck_pain | Neck pain | neck pain, stiff neck, neck hurts | gardan dard | pain:neck
back_pain | Back pain | back pain, backache, lower back pain | kamar dard, peeth dard | pain:back
sciatica | Sciatica | sciatica, pain down my leg, shooting pain in leg | nas mein dard | pain:back
shoulder_blade | Pain between the shoulder blades | shoulder blade pain, upper back pain | - | pain:shoulder
tailbone | Tailbone pain | tailbone pain, coccyx | - | pain:back
`),
  },
  {
    code: "upper_limb", number: 7, name: "Shoulders, arms and elbows",
    education: "Shoulder and elbow pain is commonly from tendons and overuse, and often improves with rest from the movements that hurt and targeted exercise.",
    warningSigns: ["Shoulder or arm pain with chest pressure, sweating or breathlessness", "A joint that looks out of shape after an injury", "A hot, swollen joint with fever"],
    specialties: ["Orthopaedic Doctor", "Physiotherapist"], references: ["nhs"],
    symptoms: S(`
shoulder_pain | Shoulder pain | shoulder pain, frozen shoulder, can't lift arm | kandhe mein dard | pain:shoulder
elbow_pain | Elbow pain | elbow pain, tennis elbow, golfer's elbow | kohni mein dard | pain:elbow
arm_pain | Arm pain | arm pain, upper arm pain, forearm pain | baazu mein dard | pain:arm
joint_stiffness | Joint stiffness | stiff joints, joint stiffness | jodon mein akdan | pain:joint
`),
  },
  {
    code: "hand", number: 8, name: "Wrists, hands and fingers",
    education: "Hand and wrist pain is often from repeated movements or arthritis; numbness in the fingers is commonly from a pressed nerve such as carpal tunnel.",
    warningSigns: ["Sudden weakness in a hand", "A cold, pale or blue finger", "A deep cut with numbness", "Wrist pain after a fall on an outstretched hand"],
    specialties: ["Orthopaedic Doctor", "Physiotherapist"], references: ["nhs"],
    symptoms: S(`
wrist_pain | Wrist pain | wrist pain, wrist hurts | kalai mein dard | pain:wrist_hand
hand_numbness | Numb hands | hands go numb, numb fingers, tingling fingers | haath sunn | pain:wrist_hand
finger_pain | Finger pain | finger pain, trigger finger, finger clicking | ungli mein dard | pain:wrist_hand
thumb_pain | Thumb pain | thumb pain, thumb hurts | angoothe mein dard | pain:wrist_hand
`),
  },
  {
    code: "lower_limb", number: 9, name: "Hips, legs, knees and feet",
    education: "Most knee, heel and foot pain comes from overuse and improves with the right footwear, load management and exercise.",
    warningSigns: ["Can't put weight on the leg", "One-sided calf swelling, especially after travel", "A cold, pale or blue foot", "A hot, swollen joint with fever"],
    specialties: ["Orthopaedic Doctor", "Physiotherapist"], references: ["nhs", "nice_cks"],
    symptoms: S(`
hip_pain | Hip or groin pain | hip pain, groin pain, buttock pain | kulhe mein dard | pain:hip
knee_pain | Knee pain | knee pain, knee hurts, knee makes noise, knee swelling | ghutne mein dard, gode vich dard | pain:knee
calf_pain | Calf pain or cramps | calf pain, leg cramps, calf cramp, calf swelling | pindli mein dard, nas chadhna | pain:calf
ankle_pain | Ankle pain | ankle pain, twisted ankle, sprained ankle | takhne mein dard, moch | pain:ankle_foot
heel_pain | Heel pain | heel pain, heel hurts | edi mein dard, addi dard | pain:ankle_foot
burning_feet | Burning feet | burning feet, feet burning, numb feet | pairon mein jalan | pain:ankle_foot
leg_pain | Leg pain | leg pain, thigh pain | pair dard, taang mein dard | pain:leg
`),
  },
  {
    code: "heart", number: 10, name: "Heart, blood pressure and circulation",
    education: "Chest pain should always be taken seriously. Palpitations are often harmless but need an ECG if they keep coming back or come with other symptoms.",
    warningSigns: ["Chest pain, pressure or heaviness, especially with sweating or breathlessness", "Fainting with palpitations", "Breathlessness at rest", "Sudden swelling of one leg"],
    specialties: ["Cardiologist", GP], references: ["nhs", "who"],
    symptoms: S(`
chest_pain | Chest pain | chest pain, chest pressure, chest heaviness, tight chest | seene mein dard, seene mein bhaaripan | pain:chest
palpitations | Palpitations | palpitations, heart racing, heart pounding, skipped beats | dil ki dhadkan tez, ghabrahat | heart
high_bp | High blood pressure | high bp, high blood pressure, hypertension, bp fluctuating | bp high | -
low_bp | Low blood pressure | low bp, low blood pressure | bp low | -
swollen_legs | Swollen legs | swollen legs, swollen ankles, leg swelling | pairon mein sujan | pain:calf
`),
  },
  {
    code: "lungs", number: 11, name: "Lungs and breathing",
    education: "Most coughs are from viral infections and settle within three weeks. Breathlessness should always be checked.",
    warningSigns: ["Struggling to breathe or lips turning blue", "Coughing up blood", "Chest pain with breathlessness", "A cough lasting more than three weeks"],
    specialties: ["Pulmonologist", GP], references: ["nhs", "who"],
    symptoms: S(`
cough | Cough | cough, dry cough, wet cough, coughing | khansi, khang | cough
breathless | Breathlessness | breathless, short of breath, difficulty breathing | saans phoolna, saans lene mein dikkat | breathing
wheezing | Wheezing | wheezing, wheeze, whistling breath | saans mein seeti | breathing
cold | Cold or flu | flu, runny nose, sneezing, have a cold, got a cold | zukam, nazla | cough
`),
  },
  {
    code: "digestive", number: 12, name: "Stomach and digestion",
    education: "Most stomach upsets, acidity and loose motions settle within a few days with fluids and light food.",
    warningSigns: ["Blood in vomit or stool, or black stool", "Severe stomach pain", "Can't keep fluids down", "Pain in the lower right side that gets worse"],
    specialties: ["Gastroenterologist", GP], references: ["nhs", "nice_cks"],
    symptoms: S(`
stomach_pain | Stomach pain | stomach pain, tummy ache, abdominal pain, stomach feels strange | pet dard, pet mein dard | stomach
acidity | Acidity or heartburn | acidity, heartburn, acid reflux, burning in stomach | pet mein jalan, khatte dakar | stomach
vomiting | Vomiting or nausea | vomiting, nausea, throwing up | ulti, jee machlana | stomach
diarrhoea | Loose motions | diarrhoea, diarrhea, loose motions | dast, pet kharab | stomach
constipation | Constipation | constipation, hard stools | kabz, qabz | stomach
bloating | Bloating or gas | bloating, gas, bloated | afara, gas | stomach
`),
  },
  {
    code: "liver", number: 13, name: "Liver, gallbladder and pancreas",
    education: "Yellow eyes or skin (jaundice), pain under the right ribs after fatty food, or severe upper stomach pain going to the back need a doctor to check.",
    warningSigns: ["Yellow eyes or skin with fever or confusion", "Severe upper stomach pain going through to the back", "Vomiting blood or black stool"],
    specialties: ["Gastroenterologist", GP], references: ["nhs", "medlineplus"],
    symptoms: S(`
jaundice | Jaundice | jaundice, yellow eyes, yellow skin | piliya, peeliya | -
gallstone_pain | Pain under the right ribs | pain under right ribs, gallstones, gallbladder | pitte ki pathri | pain:upper_abdomen
fatty_liver | Fatty liver | fatty liver | - | -
`),
  },
  {
    code: "urinary", number: 14, name: "Kidneys, bladder and urine",
    education: "Burning or frequent urination is most often a urine infection. Blood in the urine should always be checked.",
    warningSigns: ["Fever with pain in the side or back", "Unable to pass urine", "Blood in the urine", "Side pain that comes in waves with fever"],
    specialties: ["Urologist", GP], references: ["nhs", "nice_cks"],
    symptoms: S(`
burning_urine | Burning urine | burning urine, painful urination, uti | peshab mein jalan | urinary
frequent_urination | Frequent urination | peeing a lot, frequent urination, urgency | baar baar peshab | urinary
blood_urine | Blood in urine | blood in urine, red urine | peshab mein khoon | urinary
kidney_stone | Kidney stone | kidney stone, stone pain | pathri | urinary
incontinence | Leaking urine | leaking urine, incontinence | peshab nikal jana | urinary
`),
  },
  {
    code: "endocrine", number: 15, name: "Hormones, diabetes and metabolism",
    education: "Thyroid, sugar and hormone problems usually need a blood test to understand — guessing with supplements can hide the real cause.",
    warningSigns: ["Very high or very low blood sugar with confusion or drowsiness", "Rapid unexplained weight loss", "Very heavy bleeding with dizziness"],
    specialties: ["Endocrinologist", "Diabetologist", GP], references: ["nhs", "who"],
    symptoms: S(`
high_sugar | High blood sugar | high sugar, sugar is high, high glucose | sugar badh gayi | -
thyroid | Thyroid symptoms | thyroid | thyroid | hormones
pcos | PCOS | pcos, pcod | - | hormones
irregular_periods | Irregular periods | irregular periods, missed period, heavy periods | maasik dharm | hormones
excessive_sweating | Excessive sweating | sweating a lot, excessive sweating | bahut pasina | -
`),
  },
  {
    code: "skin", number: 16, name: "Skin, hair, scalp and nails",
    education: "Most rashes and itching come from irritation, allergy or infection. A photo helps, but a doctor may need to look directly.",
    warningSigns: ["Swelling of the lips, face or tongue", "A rash that doesn't fade when pressed", "A rash spreading quickly with fever", "A mole that changes shape, colour or bleeds"],
    specialties: ["Dermatologist"], references: ["nhs", "medlineplus"],
    symptoms: S(`
rash | Rash | rash, red spots, hives | daane, chakatte | skin
itching | Itching | itching, itchy skin, skin is itching | khujli, kharish | skin
acne | Acne | acne, pimples | muhase, keel | skin
hair_loss | Hair loss | hair fall, hair loss, bald patch | baal jhadna | hair
dandruff | Dandruff | dandruff, flaky scalp, itchy scalp | rusi | hair
mole | Changing mole | mole, mole changed, dark spot | til | -
nail_change | Nail changes | nail changes, nail fungus, brittle nails | nakhoon | -
`),
  },
  {
    code: "mental", number: 17, name: "Mental health and emotional wellbeing",
    education: "Low mood, anxiety and stress are common and treatable. Talking to someone you trust, and to a professional, helps.",
    warningSigns: ["Thoughts of ending your life or harming yourself", "Hearing or seeing things others don't", "Not eating, drinking or getting out of bed for days"],
    specialties: ["Clinical Psychologist", "Psychiatrist"], references: ["who", "telemanas"],
    symptoms: S(`
low_mood | Low mood | feel low, feeling down, sad, depressed, don't feel mentally well | udaas, mann nahi lag raha | mood
anxiety | Anxiety | anxious, anxiety, panic attacks, worried all the time | ghabrahat, chinta | mood
stress | Stress | stressed, burnt out, overwhelmed | tension | mood
grief | Grief | grief, grieving, lost someone | gham | mood
`),
  },
  {
    code: "sleep", number: 18, name: "Sleep and fatigue",
    education: "Most sleep problems improve with a regular routine. Loud snoring with pauses in breathing can be sleep apnoea, which needs checking.",
    warningSigns: ["Falling asleep while driving", "Someone sees you stop breathing in your sleep", "Low mood with thoughts of not wanting to be alive"],
    specialties: [GP, "Pulmonologist"], references: ["nhs"],
    symptoms: S(`
insomnia | Trouble sleeping | can't sleep, insomnia, waking up at night | neend nahi aati | sleep
snoring | Snoring or sleep apnoea | snoring, snore, stop breathing at night, sleep apnoea | kharrate | sleep
daytime_sleepiness | Daytime sleepiness | sleepy all day, falling asleep during the day | din mein neend | sleep
restless_legs | Restless legs | restless legs | - | sleep
`),
  },
  {
    code: "infections", number: 19, name: "Infections",
    education: "Most infections are viral and settle with rest and fluids. In India, a fever for more than 2–3 days in mosquito season should be tested for dengue and malaria.",
    warningSigns: ["Fever with confusion, a stiff neck or a rash that doesn't fade", "Bleeding gums or nose with fever", "Cold, blotchy skin or very fast breathing", "An animal bite or scratch"],
    specialties: [GP, "Infectious Disease Specialist"], references: ["who", "ncvbdc", "nhs"],
    symptoms: S(`
viral | Viral infection | virus, viral fever, i think i have a virus | viral bukhar | fever
dengue | Dengue | dengue | dengue | fever
malaria | Malaria | malaria | malaria | fever
typhoid | Typhoid | typhoid | typhoid, motijhara | fever
tb | Tuberculosis | tb, tuberculosis | tb | cough
covid | COVID-19 | covid, coronavirus | corona | fever
fungal | Fungal infection | fungal infection, ringworm | daad | skin
std | Sexually transmitted infection | sti, std, discharge | - | -
`),
  },
  {
    code: "reproductive", number: 20, name: "Reproductive and sexual health",
    education: "Many reproductive and sexual health concerns are common and treatable. They're handled privately and confidentially.",
    warningSigns: ["Severe pelvic pain, especially if you could be pregnant", "Very heavy bleeding with dizziness", "Sudden severe pain in a testicle"],
    specialties: ["Gynaecologist", "Urologist"], references: ["nhs", "who"],
    symptoms: S(`
period_pain | Period pain | period pain, painful periods, cramps | periods mein dard | hormones
pelvic_pain | Pelvic pain | pelvic pain, lower tummy pain | - | pain:lower_abdomen
menopause | Menopause | menopause, hot flushes, hot flashes | - | hormones
vaginal_discharge | Vaginal discharge or itching | vaginal discharge, vaginal itching | safed pani | -
breast_lump | Breast lump or pain | breast lump, breast pain | - | -
testicular_pain | Testicle pain | testicle pain, testicular pain | - | -
erectile | Erection problems | erectile dysfunction, erection problems | - | -
fertility | Trouble conceiving | infertility, can't get pregnant, trying to conceive | - | -
`),
  },
  {
    code: "pregnancy", number: 21, name: "Pregnancy and after birth",
    education: "Many changes in pregnancy are normal, but bleeding, severe pain, severe headache, reduced baby movements or leaking waters always need a same-day check.",
    warningSigns: ["Bleeding or severe tummy pain", "Severe headache, vision changes or sudden swelling", "The baby moving less than usual", "Heavy bleeding after birth"],
    specialties: ["Gynaecologist"], references: ["nhs", "who"],
    symptoms: S(`
pregnancy_concern | Pregnancy concern | pregnant, pregnancy, weeks pregnant | garbhavastha | pregnancy
morning_sickness | Pregnancy sickness | morning sickness, pregnancy nausea | - | pregnancy
reduced_movement | Baby moving less | baby not moving, reduced movements | bachcha hil nahi raha | pregnancy
postpartum | After birth | postpartum, after delivery, gave birth | delivery ke baad | pregnancy
breastfeeding | Breastfeeding problems | breastfeeding, latch, sore nipples | - | pregnancy
`),
  },
  {
    code: "children", number: 22, name: "Newborns, babies, children and teenagers",
    education: "Children are not small adults: they get their own questions and lower thresholds, especially babies under 3 months.",
    warningSigns: ["A baby under 3 months with a temperature of 38°C or more", "Ribs pulling in, grunting, or blue lips", "Floppy, very sleepy or hard to wake", "Fewer wet nappies or not drinking"],
    specialties: ["Paediatrician"], references: ["aap", "nhs"],
    symptoms: S(`
baby_fever | Baby with fever | baby fever, baby has fever, newborn fever | bachche ko bukhar | -
not_feeding | Baby not feeding | baby not eating, not drinking milk, child isn't eating | bachcha doodh nahi pee raha | -
crying | Baby crying a lot | baby keeps crying, colic, won't stop crying | bachcha ro raha | -
growth | Growth or development worries | not growing, speech delay, milestones | - | -
`),
  },
  {
    code: "older_adults", number: 23, name: "Older adult health",
    education: "In older adults, infections and medicine side effects often show up as confusion or falls rather than typical symptoms.",
    warningSigns: ["New confusion", "A fall with a head injury, especially on blood thinners", "Can't stand or walk after a fall", "Not eating or drinking"],
    specialties: [GP, "Geriatrician"], references: ["nhs", "who"],
    symptoms: S(`
fall | Fall | fell, had a fall, slipped and fell | gir gaye | fall
confusion | New confusion | confused, confusion, not themselves | - | -
memory_older | Memory problems | memory problems, forgetting, dementia | bhoolne ki bimari | -
frailty | Weakness and frailty | frail, weak, can't walk like before | kamzori | weakness
`),
  },
  {
    code: "blood_immune", number: 24, name: "Blood, immune system and cancer warning signs",
    education: "Most lumps, tiredness and bruises have harmless causes, but some signs should always be checked by a doctor.",
    warningSigns: ["A lump that is growing or lasts more than 3 weeks", "Unexplained bleeding or bruising", "Unexplained weight loss", "Night sweats with fever"],
    specialties: [GP, "Haematologist", "Oncologist"], references: ["nhs", "who"],
    symptoms: S(`
anaemia | Anaemia | anaemia, anemia, low haemoglobin, pale | khoon ki kami | weakness
lump | Lump or swelling | lump, swelling that won't go away, swollen glands | gaanth | -
bruising | Easy bruising or bleeding | bruising easily, unexplained bruises, bleeding easily | neel padna | -
autoimmune | Autoimmune condition | lupus, autoimmune, rheumatoid | - | -
`),
  },
  {
    code: "injuries", number: 25, name: "Injuries, accidents and emergencies",
    education: "For any serious injury, poisoning or sudden collapse, call emergency services first.",
    warningSigns: ["Severe bleeding", "Not breathing, unconscious or having a seizure", "Choking", "Poisoning or overdose", "A bone sticking out or a limb out of shape"],
    specialties: [GP, "Orthopaedic Doctor"], references: ["nhs", "who"],
    symptoms: S(`
cut | Cut or wound | cut, wound, deep cut, graze | ghav, chot | skin
burn | Burn | burn, scald, burnt | jalna, jal gaya | skin
sprain | Sprain | sprain, twisted, sprained | moch | pain:ankle_foot
bite | Bite | dog bite, animal bite, insect bite, snake bite | kutte ne kaata | -
allergic_reaction | Allergic reaction | allergic reaction, swelling after eating, hives | - | skin
choking | Choking | choking | - | -
`),
  },
  {
    code: "lifestyle", number: 26, name: "Lifestyle, prevention and medicines",
    education: "Regular activity, a balanced diet, not smoking, limiting alcohol and keeping up with screenings and vaccines prevent many problems.",
    warningSigns: ["A suspected overdose", "A severe reaction to a new medicine", "Signs of an allergic reaction after a medicine"],
    specialties: [GP], references: ["who", "nhs"],
    symptoms: S(`
side_effect | Medicine side effect | side effect, reaction to medicine | dawai ka side effect | -
missed_dose | Missed dose | missed dose, forgot my medicine | dawai bhool gaya | -
smoking | Stopping smoking | quit smoking, stop smoking | - | -
alcohol | Alcohol | drinking too much, alcohol | - | -
weight | Weight management | lose weight, obesity, overweight | motapa | -
vaccination | Vaccines and screening | vaccine, vaccination, check-up, screening | teeka | -
`),
  },
];

export const ALL_SYMPTOMS = DOMAINS.flatMap((d) => d.symptoms.map((s) => ({ ...s, domain: d })));
