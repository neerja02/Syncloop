# Kinwell health intelligence

How Kinwell understands a health concern, asks about it, keeps it safe and explains it. This covers the
work from the "complete human health intelligence" spec that is built so far (Phase A), and what isn't yet.

## Three layers

| Layer | What it does | Where |
| --- | --- | --- |
| Language & knowledge | Reads everyday wording (English, Hindi, Punjabi, Hinglish, misspellings), maps it to symptom concepts and body regions | `lib/clinical/lexicon.ts`, `lib/integrations/terminology/clinical.ts`, `lib/ai/guided/detect.ts`, `lib/ai/guided/anatomy.ts` |
| Conversation engine | Picks the single most useful next question from what's already known; one question at a time; never repeats one | `lib/ai/guided/symptom-engine.ts`, `modules.ts`, `anatomy.ts`, `baby-engine.ts`, `vet-engine.ts`, `agent.ts` |
| Safety engine | Checks typed messages against versioned triage rules before anything else, and re-checks red flags after every tapped answer; an emergency always interrupts the flow | `lib/clinical/triage.ts`, `database/seeds/clinical-rules.ts`, each engine's `screen()` |

Every assessment ends in one of four care levels: **Emergency now**, **Same-day care**, **See a doctor**,
or **Safe to monitor with precautions**. Emergency numbers come only from `lib/clinical/emergency-config.ts`.

## Everyday language

`englishReading()` adds an English reading next to the original message (it never replaces it). Phrases are
translated before single words, and Hindi negation is kept: "bukhar nahi hai" reads as "no fever". Both the
triage concepts and the symptom detection use the original plus the reading, so "Seene mein bhaaripan hai aur
pasina aa raha hai" triggers the same chest-pain-with-sweating emergency rule as the English sentence, and
"Mujhe jeena nahi hai" triggers the crisis response.

Words that are also English ("pet", "pair", "sir") are only translated in a Hindi context ("pet mein",
"pair mein", "sir dard").

## Anatomy

`anatomy.ts` holds eight regions as data: neck, shoulder, elbow, wrist & hand, hip, knee, calf, and ankle &
foot. Each region defines:

- its anatomical path (e.g. Lower limb → Foot → Underneath the heel) and whether to ask left/right
- a sub-location question ("front, back, inner side or outer side of your knee?")
- its own warning signs (e.g. a cold, pale foot; one-sided calf swelling after travel; neck stiffness with fever)
- one or two pattern questions that tell common causes apart (first steps in the morning; worse gripping)
- cautiously worded possibilities, self-care, warning signs to watch for, and who to see first

Adding a region is a data change; the engine calls `regionNext`, `regionScreen` and `regionOutcome`.

## What the person sees at the end

- the care level
- **What I've understood** — a short summary, including the anatomical location
- **What this could be** — two to four possibilities, phrased as possibilities, with "this isn't a diagnosis"
- **What you can do now** and **Get urgent help if you notice**
- the type of clinician to see, when one is recommended (never a real doctor or appointment it can't confirm)

## Mental health

Low mood, anxiety, stress and grief have their own check. It asks how long, then — kindly and directly —
whether the person has had thoughts of not wanting to be alive:

- "Yes, and I might act on them" → the crisis response immediately (crisis line and emergency number)
- "Sometimes, but I'm safe right now" → the check continues, a Psychiatrist is suggested, and the crisis line
  is always shown
- typed crisis wording in English or Hindi is caught by the triage layer before any question is asked

## Clinical governance

All rules, questions and wording are **demo content pending clinical review**. Before real patients use it:

1. a clinician reviews every red-flag rule, question and possibility, per jurisdiction
2. safety-critical content gets a reviewer, review date and version (triage rules already carry versions)
3. native speakers review the Hindi/Punjabi vocabulary
4. the high-risk test cases in `tests/health-intelligence.test.ts` are reviewed by clinicians

No medical references are cited in the content yet; none have been made up.

## More checks (Phase B)

`modules-more.ts` adds ear, nose and throat; teeth and mouth; urinary; sleep; and pregnancy and after birth,
each with its own warning signs (e.g. drooling or noisy breathing, spreading facial swelling, unable to pass
urine, falling asleep while driving, reduced baby movements, heavy bleeding after birth). Fever now asks about
mosquito exposure, travel, water and food, TB contact and animal bites, then dengue warning signs, and offers
location-aware possibilities (dengue, malaria, typhoid). Thoughts of harming yourself or the baby after birth
go straight to the crisis response.

## Knowledge as data (Phase B)

`lib/clinical/knowledge/registry.ts` holds all **26 domains** from the spec: each with symptoms, everyday
English wording, Hindi/Punjabi variants, the guided check that handles it (if any), warning signs,
specialties and references. On every start, `syncKnowledge` writes it to the database:

| Table | Holds |
| --- | --- |
| `knowledge_domains`, `knowledge_symptoms` | current content, `version`, `review_status`, `reviewed_by`, `last_reviewed_at` |
| `knowledge_versions` | every previous version's content |
| `knowledge_references` | publisher-level references (NHS, MedlinePlus, NICE CKS, WHO, AAP, Tele-MANAS, NCVBDC) |
| `assessment_audit_log` | every completed or escalated assessment: answers, warning signs, care level, specialist, possibilities, rule versions and engine version |

A change to any domain or symptom bumps its version and puts it back to **pending clinical review**, even if it
had been approved. A clinician approves content by setting `review_status = 'approved'`, `reviewed_by` and
`last_reviewed_at`.

`classifySymptom` matches a message against every symptom in the registry. If the symptom has a guided check
it starts it; if not (for example jaundice, a lump, or a changing mole) Kinwell gives safe general guidance:
what it relates to, the domain's warning signs, and the right type of clinician. With a Claude API key
configured, those open questions go to the AI under the master health-agent prompt instead.

## Body map (Phase C)

"Where is the pain?" now shows a front/back body figure. Tapping a spot sends the side, the area and, where
it's clear, the sub-location (for example "back of the left knee"), so those questions aren't asked again. The
list of areas is still one tap away, for accessibility and for anyone who prefers it.

## Not built yet

- specific reference pages per symptom (chosen during clinical review)
- a reviewer screen for approving knowledge content (approval is a database update for now)
- reading lab trends inside the knowledge layer
