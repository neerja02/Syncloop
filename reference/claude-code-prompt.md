# Build "Sister Asha" — an AI health nurse for elderly people (React + Tailwind)

You are building a clickable, demo-ready web prototype. A reference prototype in plain HTML/JS is in this repo at `reference/sister-asha.html`. Open it in a browser first and match its behaviour, flows and Hinglish copy. Rebuild it properly in React + Tailwind with clean components, typed data and swappable services.

## 1. Product in one paragraph

Asha is a warm, caring nurse who already knows the patient. She is not a chatbot. There are no chat threads and no "New chat" button. The family sets up a profile once (conditions, doctors, medicines, history). After that, Asha starts each day herself. She asks about yesterday's problem, reminds medicines, and collects BP and sugar readings by phone call and WhatsApp. She lines up tests before doctor visits, runs a weekly health check, and alerts the family when something is wrong. She **never prescribes or changes medicines** and never makes medical decisions. The users are elderly Indian people (60+) and their adult children. She speaks **Hinglish** by default.

## 2. Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS 3. Define design tokens as CSS variables and map them in `tailwind.config` so light and dark themes both work.
- Zustand for state, persisted to `localStorage` so the demo survives refresh, plus a "Start over" reset.
- React Router is optional. A single-page layout with tab state is fine.
- No backend for v1. Every external integration (voice calls, WhatsApp, prescription OCR, LLM) goes behind a TypeScript interface with a **mock implementation**. The demo runs offline, and real providers can be plugged in later.
- Fonts: "Atkinson Hyperlegible" for body text (built for low-vision readers) and "Literata" for Asha's voice and headings.

## 3. Screen layout (desktop demo)

Three columns:

1. **Phone frame** (max 420px wide, about 820px tall): the actual app.
2. **Test rail**: a vertical column of large icon buttons with labels beside the phone, used to trigger simulations:
   - 📞 Daily call
   - 💬 WhatsApp
   - 🗓 Weekly check
   - 🩺 Doctor visit
   - ⚠️ High reading
   - ⏭ Next day
   - ↺ Start over
   
   All buttons except "Start over" are disabled until a profile exists.
3. **Presenter guide**: a short pitch, a 7-step demo walkthrough, a "Asha does / Asha never does" box, and a fine-print note about what is simulated.

On screens under 620px wide, the rail becomes a horizontal scrolling row above the phone and the guide goes below.

## 4. Accessibility for elderly users (mandatory)

- Base font is 17px, Asha's messages are 17–18px, and tap targets are at least 44px.
- High contrast in both themes. Never rely on colour alone; every status has a text label.
- Use simple words. Avoid medical jargon in what the patient sees; the family can see the details.
- Every input works by tapping a big chip. Typing is always optional.

## 5. Onboarding: profile setup (shown before any chat)

A 5-step wizard inside the phone with a progress bar and Back/Next buttons. Step 1 has a **"Fill sample"** button that loads demo person 1 (Ramesh ji). When adding a second family member, it loads demo person 2 (Kamla ji).

1. **Who is Asha caring for?** Full name, what Asha calls them ("Ramesh"), the label shown in the app ("Papa"), age, phone, gender chips, language chips (Hinglish / Hindi / Punjabi / English), and the family contact's name, relation and phone. Name is required.
2. **Health conditions.** Multi-select chips: Diabetes, High BP, Cholesterol, Thyroid, Heart, Arthritis, Kidney, Asthma. Also allergies and a free-text medical history.
3. **Doctors and medicines.**
   - A "Scan a prescription" button (mock OCR fills doctors and medicines).
   - A doctor list: name, speciality, next check-up date/time, and the test needed before the visit.
   - A medicine list: name, dose, when (multi-chip: Early morning / Morning / Afternoon / Night), and prescribed by (select from doctors). Add and remove rows.
4. **The care plan.** Auto-generated from the conditions (see §6), grouped by frequency. Each reading shows a Call / WhatsApp selector (lab tests show a fixed "Lab" badge). Also lists each doctor's next check-up with "test X, 2 days before · reminder the day before".
5. **How Asha checks in.**
   - Daily call time (select).
   - Morning medicines reminder by Call or WhatsApp.
   - Afternoon and night medicines reminder by WhatsApp or Call.
   - Weekly health check day and time.
   - "Alert family when" toggles: medicine missed twice, reading out of safe range, two calls unanswered.
   
   The final button is **"Meet Asha"**.

The profile is editable later from the Profile tab using the same wizard. Saving rebuilds the care plan and the medicine schedule while keeping today's ticks.

Multiple family members are supported. A pill switcher sits at the top, with "+ Add family member". Each person has their own history, chat, readings and follow-ups. There is **one continuous conversation per person** and never threads.

## 6. Care plan engine (`src/domain/carePlan.ts`)

Build the plan as a pure function: `buildPlan(profile) → Reading[]`.

| Condition | Reading | Frequency | When | Default channel |
|---|---|---|---|---|
| High BP | Blood pressure (mmHg) | Daily | 8:30 am on the check-in call | Call |
| Diabetes | Fasting sugar (mg/dL) | Daily | 7:30 am, before tea | WhatsApp |
| Diabetes | Sugar 2 hrs after lunch | Weekly | Saturday 3 pm | WhatsApp |
| Diabetes | Feet check (cuts, swelling) | Weekly | Sunday health check | Call |
| Diabetes | HbA1c | Every 3 months | Before diabetes check-up | Lab |
| Cholesterol | Lipid profile | Every 6 months | Before heart/BP check-up | Lab |
| Thyroid | TSH | Every 3 months | Before thyroid check-up | Lab |
| Heart | Pulse | Daily | With BP | Call |
| Heart | ECG | Every 12 months | Before heart check-up | Lab |
| Arthritis | Joint pain score 0–10 | Weekly | Sunday health check | Call |
| Kidney | Creatinine | Every 3 months | Before kidney check-up | Lab |
| Asthma | Breathlessness check | Daily | On the check-in call | Call |
| Everyone | Weight (kg) | Monthly | 1st Sunday | Call |
| Everyone | Weekly health check | Weekly | Sunday 10 am | Call |

Remove duplicate readings, sort by frequency, and apply the user's channel overrides.

**Reading judgement** (`judgeReading(id, value) → 'good' | 'warn' | 'low' | 'bad'`):

| Reading | bad | warn | low |
|---|---|---|---|
| BP | ≥170 or ≥105 | ≥140 or ≥90 | systolic <95 |
| Fasting sugar | ≥250 | >130 | <70 |
| Post-meal sugar | ≥300 | >180 | <70 |
| Pain score | — | ≥7 | — |

Each result produces a Hinglish chat reply, plus a spoken line for calls:
- **good:** "Bilkul theek hai 👍"
- **warn:** a home tip, plus "3 din aisa raha toh doctor ko dikhayenge"
- **low sugar:** "ek chammach cheeni paani mein", recheck in 15 minutes, and alert family
- **bad:** a red alert card ("aaraam se baithiye… seene mein dard / chakkar ho toh 112"), and family alerted

**Doctor alignment:** compute the next visit from the doctors' dates and show the days remaining. If it is within 10 days, Asha mentions it on calls and in chat. The doctor-visit WhatsApp reminder lists what to carry: the test report, the medicine list, and an auto-made 2-week BP/sugar diary.

## 7. Main app tabs (bottom nav: Talk · Today · Health · Profile)

### Talk: the conversation with Asha

The header shows Asha's avatar with an online dot, "Sister Asha", and "Your nurse · knows Ramesh ji's health". It has one continuous conversation with date pills. Message types are: nurse bubble, my bubble, system note (call logs, "Asha messaged Neha…"), red alert card, and inline cards (medicine checklist, home-remedy tips with ticks, reading input with Save, lab report before→now table, weekly check summary, prescription read from photo). Big reply chips sit above the composer. The composer has a camera button (share a prescription or report), a text input, a mic button (mock speech-to-text that cycles sample Hinglish phrases), and Send. Show a typing indicator before each Asha message, with the delay scaled to message length.

**Conversation flows** (scripted state machine in `src/agent/flows.ts`):

- **First meeting:** introduces herself, says what the family shared, explains her routine (daily call time, WhatsApp night reminders, weekly check), then asks "Aaj aap kaisa feel kar rahe hain?" Chips: Bilkul theek / Pet thoda kharab hai / Ghutne mein dard hai / Neend nahi aayi.
- **Problem:** stores a `followup`, shows a tips card with 3 home remedies, and says "Kal subah main poochhungi".
- **Daily greeting (next day):** if a followup exists, Asha asks about it first. "Pehle se behtar" clears it. "Waisa hi hai" offers to ask the family to book the right doctor. "Aur badh gaya" alerts the family and says to see a doctor today.
- **Medicines:** a morning medicine card. "Sab le li" or ticking every item leads to "Subah ki dawai ho gayi ✓".
- **Reading:** a fasting sugar (or BP) input card. The judgement reply follows.
- **Wrap up:** mentions an upcoming doctor visit, then "main yahin hoon".
- **Free text and voice (keyword router):**
  - Emergency words (chest pain, seene, saans, gir gaye, behosh) → red card with "112", family called, "main yahin hoon".
  - "BP 128/82" or "sugar 140" in text → log and judge the reading.
  - Double-dose questions ("ek aur goli", "again") → "already taken at 8:32, doosri mat lijiye".
  - "Can I take paracetamol / change dose" → refuse kindly and offer to ask the family to check with the doctor.
  - "Did I take…" → list taken and pending medicines.
  - Knee, stomach or sleep → the problem flow.
  - Report → the latest report card.
  - Doctor or appointment → the next visit and the test needed before it.
  - General symptoms → ask "since when", then follow up later or suggest a doctor.
  - Thanks → a warm reply.
  - Fallback → ask for more detail.
- **Share prescription (mock OCR):** shows a card comparing against current medicines ("No change" / "New"), adds the new medicine (for example, Ecosprin 75 mg after lunch) to the schedule, and sets a WhatsApp reminder.

### Today

Progress ring (medicines taken + readings logged out of the total due). Medicines grouped by slot as large tick rows with a Call/WhatsApp channel badge. Tapping an already-taken medicine shows a toast: "already taken at 8:32, doosri mat lijiye", with an Undo button. "Readings due today" lists daily readings plus weekly ones on their day; each shows the logged value or "Enter reading" and its channel.

### Health

- Asha's plain-language summary.
- A 2-column grid of status tiles (BP 7-day average, fasting sugar 7-day average, each lab trend, medicine adherence %, any active followup, weight), each with a text badge: On track / Improving / Watching / High.
- Weekly health check history.
- Charts: BP last 8 days (systolic and diastolic lines with a 140 reference line), fasting sugar (target under 130), and lab trends over the year (for example, HbA1c Jan 8.2 → Oct 7.1).
- Doctor visits with the test needed before each.
- Prescriptions grouped **by doctor** (patients have multiple doctors).
- Reports with before → now and a badge.

Draw charts with a small custom SVG component or Recharts, using theme tokens.

### Profile

Personal details, conditions, allergies, history, and family contact. "Edit profile" reopens the wizard. Asha's care plan grouped by frequency with channel badges. The check-in schedule. The list of situations that trigger family alerts.

## 8. Phone call simulation (`src/sim/CallScreen.tsx`)

Full-screen overlay inside the phone, with a dark background:

1. **Incoming screen:** "Sister Asha · Daily check-in · 8:30 am · calling Ramesh Sharma", Decline/Answer buttons, a "Play Asha's voice" toggle, and a voice picker.
2. **In-call screen:** a timer, Asha's line as a large caption, and reply buttons labelled "Ramesh ji says". For readings, a number input prefilled with a sample value and a "Bata diya" button. After a reading, insert Asha's spoken judgement as the next step.
3. **On end:** append a call-log note to the chat (for example, "Check-in call · 8:30 am · 2 min · feeling better, morning medicines taken, BP 132/84") and update medicines and readings.
4. **On decline:** note "Missed call. Will retry in 30 min, then message Neha."

**Daily call script:**
1. Greeting and "neend kaisi aayi?"
2. Yesterday's followup, if any.
3. Morning medicines with Call as the channel: "le li aapne?"
4. BP reading, if it is in the plan and not logged today.
5. Upcoming doctor visit, if within 10 days.
6. Goodbye, mentioning the WhatsApp night reminder.

**Weekly health check script:**
1. Sleep
2. Pain
3. Joint pain score (if arthritis)
4. Appetite
5. Mood
6. Feet (if diabetes)
7. Weight input

Then Asha speaks a summary and "report Neha ko bhej rahi hoon". Build a weekly result with rows (medicines x/y, BP average, sugar average, sleep, pain, appetite, mood, feet, weight) and a verdict: "Better than last week" / "Same as last week, mostly fine" / "Needs attention this week". Save it to Health, post a card in chat, and add a note "Weekly summary sent to Neha on WhatsApp".

### Voice: warm, caring Indian woman in her 30s, Hinglish

Create `src/services/voice/` with interface `VoiceService { speak(line: {show: string; say: string}): void; stop(): void }`.

- Every Asha line has two forms:
  - `show`: romanised Hinglish for the caption, for example "Namaste Ramesh ji, main Asha bol rahi hoon. Kal raat neend kaisi aayi?"
  - `say`: Devanagari Hinglish for a Hindi voice, for example "नमस्ते Ramesh जी, मैं आशा बोल रही हूँ। कल रात नींद कैसी आई?" English words like BP, WhatsApp and medicine names may stay in Latin script.
- **v1 mock (`WebSpeechVoice`):** use `speechSynthesis`. Pick a voice in this order:
  1. hi-IN neural voice (Edge "Microsoft Swara Online (Natural)")
  2. Another hi-IN female voice (Google हिन्दी, Kalpana, Lekha)
  3. Any hi-IN voice
  4. en-IN female (Heera, Neerja)
  5. Any en-IN voice
  
  Speak `say` with a Hindi voice, or `show` with an English one. Use rate 0.9 and pitch 1.08. Show a voice picker in the call screen. Handle `onvoiceschanged`, wrap everything in try/catch, and keep captions always visible.
- **Production adapters (stubs with TODO and env vars):**
  - `ElevenLabsVoice`: a multilingual model with a warm Indian female voice.
  - `SarvamVoice`: Sarvam AI "Bulbul" Hindi/Hinglish TTS.
  
  Document how to switch providers in the README.

## 9. WhatsApp simulation (`src/sim/WhatsAppScreen.tsx`)

A WhatsApp-style overlay (generic styling, no WhatsApp logo) labelled "Simulated WhatsApp". It keeps a persistent thread per person with date separators.

- **Rail "WhatsApp" (once per day):**
  - 7:30 am fasting sugar request. The patient types a number in the input bar; Asha judges and logs it.
  - Saturday post-lunch sugar request.
  - 1:30 pm afternoon medicines with buttons "✅ Le li" / "⏰ 30 min baad".
  - 8:30 pm night medicines with buttons "✅ Le li" / "⏰ 30 min baad yaad dilana". Taken marks the doses and posts a note in the app chat. Later replies "9:10 baje yaad dilaungi, jawab nahi aaya toh call karungi".
- **Rail "Doctor visit":** a day-before reminder with the date/time, doctor, and a checklist of what to carry. Buttons "👍 Theek hai" / "📅 Date badalni hai" (the second tells the family to rebook).

Interface: `MessagingService { send(to, message, buttons?) }`, with a mock now and a TODO adapter for the WhatsApp Business Cloud API (or Gupshup / Interakt / Twilio).

## 10. Other rail actions

- **High reading:** Asha asks for an evening BP with an input prefilled at 174/106. Saving shows the red alert card and a note that the family was messaged.
- **Next day:** advance the simulated date (base date: Wed 14 Oct 2026), reset today's medicine ticks, and start the day with the follow-up greeting. Weekly readings appear on Saturday and Sunday.
- **Start over:** clear the store and reopen onboarding.

## 11. Data model (`src/domain/types.ts`)

```ts
type Slot = 'Early morning' | 'Morning' | 'Afternoon' | 'Night';
type Channel = 'Call' | 'WhatsApp' | 'Lab';
interface Profile { name; first; rel; age; gender; lang; phone; caregiver: {name; rel; phone};
  conditions: string[]; allergies; history; doctors: Doctor[]; meds: Medicine[];
  checkin: { callTime; medMorning: Channel; medNight: Channel; weekly; alerts: ('missed'|'range'|'noanswer')[] };
  planChannelOverrides: Record<string, Channel>; }
interface Doctor { name; speciality; nextVisit?: string; testsBefore?: string }
interface Medicine { name; dose; times: Slot[]; note?; prescribedBy }
interface Dose { id; medicine; dose; slot: Slot; channel: Channel; takenAt?: string }
interface ReadingDef { id; name; unit; freq; when; channel: Channel; defaultValue? }
interface ReadingLog { day: number; value: number | {sys:number; dia:number} }
interface Person { profile; plan: ReadingDef[]; doses: Dose[]; readings: Record<string, ReadingLog[]>;
  labs: Record<string, {name; unit; target; points: [string, number][]}>; reports; weeklyChecks;
  chat: ChatItem[]; whatsapp: WaItem[]; followup?: 'stomach'|'knee'|'sleep'; met: boolean; startedDay: number; }
```

Seed sample history for the demo people (7 days of BP and sugar, lab trends, one recent blood report, last week's adherence of 26/28). Copy the exact values from the reference HTML (`SAMPLES` and `HISTORY`).

## 12. Asha's rules (enforce in code and in copy)

1. Never suggest, add, stop or change a medicine or dose. Only remind what doctors prescribed, and refer questions to the doctor through the family.
2. Home remedies only: warm compress, jeera water, rest, diet, hydration, gentle walking.
3. Emergency words or a dangerous reading → tell them to call 112, alert the family immediately, and give no home remedies.
4. Prevent double doses: always check `takenAt` before confirming a dose.
5. Speak like a caring nurse or family member: short sentences, "ji", warm Hinglish, one question at a time.
6. Remember context: follow up on yesterday's problem before anything else.

Also write `src/agent/ashaSystemPrompt.ts` with these rules as a system prompt, plus an `AgentBrain` interface (`reply(person, message) → AgentTurn`). The scripted engine is the default implementation. Add a TODO `LlmBrain` stub that would call an LLM API through a backend proxy, so the scripted flows can later be replaced without UI changes.

## 13. Folder structure

```
src/
  app/App.tsx, layout/(PhoneFrame, TestRail, PresenterGuide)
  onboarding/(Wizard, StepAbout, StepHealth, StepDoctorsMeds, StepCarePlan, StepCheckins)
  tabs/(TalkTab, TodayTab, HealthTab, ProfileTab)
  chat/(MessageList, NurseBubble, Cards/*, ReplyChips, Composer, TypingIndicator)
  sim/(CallScreen, WhatsAppScreen)
  agent/(flows.ts, router.ts, ashaSystemPrompt.ts, brain.ts)
  domain/(types.ts, carePlan.ts, readings.ts, weekly.ts, visits.ts, samples.ts)
  services/(voice/*, messaging/*, ocr/*)
  store/useStore.ts
  ui/(Badge, Button, Chip, TickRow, Ring, LineChart, Toast)
```

## 14. Done when

- [ ] `npm run dev` opens the three-column demo. Onboarding shows first, and "Fill sample" plus 5 × Next lands in Asha's first-meeting conversation.
- [ ] Choosing "Ghutne mein dard hai", then "Next day", makes Asha ask about the knee first.
- [ ] Daily call: speaks Hinglish in a female Indian voice where available, logs BP, marks morning medicines, and posts a call-log note.
- [ ] WhatsApp: typing "126" logs fasting sugar; "✅ Le li" marks night medicines in the app.
- [ ] Weekly check produces a summary card in chat and an entry in Health.
- [ ] High reading 174/106 shows the red alert and a family-notified note.
- [ ] Typing "kya main ek aur BP ki goli le sakta hoon" gets a double-dose warning, and "paracetamol le sakta hoon?" gets a polite refusal.
- [ ] A second family member (Kamla ji) can be added and switched to, with separate history.
- [ ] Works at 390px width, in light and dark themes, with no horizontal scroll.
- [ ] README explains the demo steps and how to plug in real voice, WhatsApp and LLM providers.

Build it step by step: domain and store first, then onboarding, then the tabs, then the call and WhatsApp simulations, then polish. Run the dev server and click through the whole checklist before finishing.
