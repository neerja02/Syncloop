# Sister Nia

A caring AI nurse for elderly people. The family sets up a profile once. After that, Nia checks in every day: she calls with a **live Hinglish voice** (ElevenLabs), asks how they are, ticks off medicines, records BP and sugar readings, follows up on yesterday's problem, lines up tests before doctor visits, runs a weekly health check, and alerts the family when something is wrong. **She never prescribes or changes medicines.**

Built with React, TypeScript, Tailwind CSS, Zustand, a small Express server, and the ElevenLabs Agents React SDK.

## Run it

```bash
npm install
cp .env.example .env        # then paste your ElevenLabs API key into .env
npm run dev                 # app on http://localhost:5173, API on :8787
```

Open http://localhost:5173 in **Chrome or Edge**, and allow the microphone when the call starts.

To run the production build on a single port: `npm run build && npm start`, then open http://localhost:8787.

### `.env`

| Key | What it is |
|---|---|
| `ELEVENLABS_API_KEY` | From ElevenLabs → Developers → API keys. It stays on the server and is never sent to the browser. |
| `ELEVENLABS_AGENT_ID` | The "Sister Nia – Elderly Care Nurse" agent: `agent_8401m4vje8w3fdjajg1v11y7z1ef` |
| `PORT` | API port, default 8787 |
| `TWILIO_*` | Optional. Lets the SOS button place real calls and WhatsApp messages. See *How the SOS button works*. |

Without a key, the app still works. The call screen offers an **offline call**, which is scripted and uses the browser's Hindi voice.

## Demo walkthrough (about 5 minutes)

1. **Set up the profile.** Tap **Fill sample: Ramesh ji**, then step through the 5 screens: details, conditions, doctors and medicines, the auto-built care plan, and check-in settings. Tap **Meet Nia**.
2. **First conversation.** Nia introduces herself and her routine. Choose **Ghutne mein dard hai**: she gives home-care tips and says she'll ask tomorrow. Tick the morning tablets and enter fasting sugar.
3. **Daily call (live).** In the test rail, tap **Daily call**, then **Answer**. Talk to Nia in Hindi or Hinglish:
   - "Haan, Amlodipine le li", and it gets ticked on the Today tab.
   - "BP 132 by 84", and it's logged and appears on the Health chart.
   - "Seene mein dard ho raha hai", and she tells you to call 112 and alerts Neha.
4. **WhatsApp.** Type a sugar number to answer the reading request, then tap **✅ Le li** on the night-medicine reminder.
5. **Next day.** Nia remembers yesterday's problem and asks about it first, in chat and on the call.
6. **Weekly check** and **Doctor visit.** A weekly health-check call (sleep, pain, appetite, mood, feet, weight) that produces a summary, and a day-before reminder listing the papers to carry.
7. **High reading.** Enter 174/106. Nia stays calm, gives safe steps, and alerts the family.
8. **+ Add family member** → **Fill sample: Kamla ji**. One nurse for the family, each person with their own history.
9. **SOS.** Tap the red **SOS** button at the top. After a 5-second countdown (with a big **Cancel, I'm OK**), Nia calls and WhatsApps the emergency contacts with the person's location. Saying "seene mein dard" in chat opens the same screen. Emergency contacts are edited in **Profile → Emergency contacts** (or in the profile setup).
10. **Upload.** In **Talk**, use the camera to take a photo, or the paperclip to upload a photo or PDF. Nia asks whether it's a prescription or a test report, then files it.

Other things to try: the camera button reads a new prescription (simulated) and adds a medicine. Typing "kya main ek aur BP ki goli le sakta hoon" gets a double-dose warning, and "paracetamol le sakta hoon?" gets a polite refusal plus an offer to ask the doctor through family.

## How the live call works

```
Browser (React)                       Server (Express)                 ElevenLabs
───────────────                       ────────────────                 ──────────
Answer → GET /api/asha/signed-url ──► uses ELEVENLABS_API_KEY ───────► signed URL
startSession({ signedUrl, dynamicVariables })  ──────────────────────► Nia agent (Hinglish voice)
                ◄────────── client tool calls during the call ───────────
log_reading · mark_medicine_taken · alert_family · note_followup · save_weekly_check
```

- **Dynamic variables** sent at the start of each call are built in `src/agent/callTools.ts`: patient name, relation, age, conditions, medicines due, readings due, yesterday's follow-up, next doctor visit, call type and family contact.
- **Client tools** are handled in the same file and update the app live during the call.
- The agent's personality, call order, reading limits and safety rules live in the ElevenLabs agent's system prompt.

### Nia's voice

Nia speaks with **Zara – Soft, Sweet & Husky** (voice ID `OtEfb2LVzIE45wdYe54M`). To change it, add another voice to "My voices" in the ElevenLabs **Voice Library**, then open **Agents → Sister Nia → Voice** and select it.

## How the SOS button works

```
SOS → 5 s countdown → browser location → POST /api/emergency ──► Twilio: phone call (spoken Hindi alert) + WhatsApp message
                                                    └─ not set up? ──► opens the phone dialer, plus Call / WhatsApp buttons for each contact
```

- Contacts come from **Profile → Emergency contacts** (up to 3; the first is called first). If none are saved, the family contact is used.
- **Automatic calls and WhatsApp** need a Twilio account. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_CALL_FROM` (a Twilio number that can call India) and `TWILIO_WHATSAPP_FROM` to `.env`. While testing, use the Twilio WhatsApp sandbox; each contact must first send the sandbox join code. For production, WhatsApp needs an approved message template.
- Without Twilio, the SOS screen opens the dialer on a phone and shows **Call** and **WhatsApp** buttons with the message and location filled in.
- The route allows at most 5 SOS requests every 10 minutes, so a public deployment can't be used to place lots of calls.

## Project layout

```
server/index.ts              Signed-URL endpoint; serves dist/ in production
src/domain/                  Care-plan rules, reading limits, sample patients, health summaries
src/agent/flows.ts           Nia's in-app chat (proactive greeting, follow-ups, medicines, readings)
src/agent/callTools.ts       Live-call dynamic variables and client tools
src/agent/simCall.ts         Offline scripted call and browser voice fallback
src/store/useStore.ts        App state (saved in the browser's localStorage)
src/components/…             Phone UI, onboarding wizard, tabs, call and WhatsApp screens, test rail
reference/                   The original HTML prototype and build prompts
```

## What's real and what's simulated

| Feature | Status |
|---|---|
| Voice check-in and weekly calls | **Real**: live ElevenLabs agent through the browser microphone |
| Medicine ticks, readings, alerts, follow-ups from the call | **Real**: written by Nia's tool calls |
| Phone calls to a real phone number | Not yet. Needs a Twilio, Exotel or Plivo number linked to the same agent, plus an outbound-call route |
| WhatsApp messages | Simulated in the app (WhatsApp Business API later) |
| SOS emergency call and WhatsApp | **Real** with Twilio set up; otherwise opens the dialer and WhatsApp |
| Prescription and report reading (camera and upload) | Simulated (OCR or vision model later). The file is picked for real but not read yet |
| Family alerts | Shown in the app (SMS or WhatsApp to the caregiver later) |
| Data storage | Browser localStorage (database later) |

## Safety rules Nia follows

- Never prescribes, adds, stops or changes a medicine. Questions go to the doctor through the family.
- Home remedies only: rest, warm compress, light food, water, gentle walking.
- Emergency words (chest pain, breathlessness, fall, fainting) mean: tell them to call 112 now and alert the family.
- Prevents double doses by checking what's already taken today.
