# Add-on: real voice calls with ElevenLabs (paste after the main Sister Asha prompt)

Replace the **simulated** phone call with a **real, live voice conversation** with Asha using ElevenLabs Agents. There is no phone number and no Twilio yet; the call runs in the browser over the microphone. Keep the incoming-call screen exactly as designed (ringing, Answer/Decline, timer, captions). Only the audio and the conversation become real. WhatsApp stays simulated.

## The agent already exists

The agent is already created in my ElevenLabs account. Do not create a new one.

- **Agent ID:** `agent_8401m4vje8w3fdjajg1v11y7z1ef`
- **Name:** Sister Asha – Elderly Care Nurse
- **Language:** Hindi (speaks Hinglish)
- **LLM:** gemini-2.5-flash
- **Timezone:** Asia/Kolkata
- **First message:** "Namaste {{patient_name}} ji, main Asha bol rahi hoon. Kaise hain aap aaj?"
- The system prompt holds Asha's personality, call order, reading limits and safety rules. It uses dynamic variables, which the app must pass in.

## 1. Packages and environment

- Install the official ElevenLabs React SDK (`@elevenlabs/react`, with its `useConversation` hook). Check the current docs at https://elevenlabs.io/docs for the exact package name and API before coding.
- Add a tiny backend (`server/` using Express or Vite middleware) with **one route**: `GET /api/asha/signed-url`. It calls the ElevenLabs "get signed URL" endpoint for the agent using `ELEVENLABS_API_KEY` from `.env` and returns the signed URL. **The API key must never reach the browser.**
- Create `.env.example` with `ELEVENLABS_API_KEY=` and `ELEVENLABS_AGENT_ID=agent_8401m4vje8w3fdjajg1v11y7z1ef`, and add `.env` to `.gitignore`.
- Fallback: if the agent is public, the client may start with `agentId` directly. Use the signed URL by default.
- Add one script (for example with `concurrently`) so `npm run dev` starts both the app and the server.

## 2. Starting the call

When the user taps **Answer** on the incoming-call screen:

1. Request microphone permission. If it's denied, show a friendly message and offer the existing simulated call as a fallback.
2. Fetch the signed URL from `/api/asha/signed-url`.
3. Start the conversation session with these **dynamic variables**, built from the current person's profile and today's state:

| Variable | Example |
|---|---|
| `patient_name` | "Ramesh" |
| `relation` | "Papa" |
| `age` | "72" |
| `caregiver_name` | "Neha" |
| `conditions` | "Diabetes, High BP, Cholesterol, Arthritis" |
| `medicines_due` | "Metformin 500 mg (after breakfast), Amlodipine 5 mg (BP)". List only today's not-yet-taken doses whose channel is Call; use "none" if empty. |
| `readings_due` | "BP". The daily readings with channel Call that aren't logged today. On the weekly call: "weekly health check: sleep, pain, appetite, mood, feet, weight". |
| `followup` | "kal ghutne mein dard tha, garam sek suggest kiya tha", or "none" |
| `next_visit` | "Dr. Anil Mehta on 22 Oct, 10:30 am (carry HbA1c report)", or "none in next 10 days" |
| `call_type` | "daily check-in" or "weekly health check" |

**Every variable must be a non-empty string.** Missing variables make the call fail.

## 3. Client tools: register these exact names in the SDK

Asha calls these tools during the conversation, and the app must handle each one and update the store live:

| Tool | Parameters | App does | Return to agent |
|---|---|---|---|
| `log_reading` | `reading_type`: bp, fasting_sugar, post_meal_sugar, weight, pulse, pain_score; `value`: string, e.g. "132/84" | Parse the value, run the existing `judgeReading`, save the reading for today, and show a toast "BP 132/84 logged". Map `fasting_sugar` to `fbs`, `post_meal_sugar` to `ppbs`, `pain_score` to `pain`. | `"saved: good"`, `"saved: warn"`, `"saved: bad"`, `"saved: low"`, or `"invalid value"` |
| `mark_medicine_taken` | `medicine_name` | Fuzzy-match (case-insensitive) against today's doses. If it is already taken, don't change anything. | `"marked"`, `"already taken at 8:32 am, do not take again"`, or `"not found"` |
| `alert_family` | `severity`: urgent or emergency; `reason` | Add a red note to the chat: "Asha alerted Neha (98722 11890): {reason}". Show a red banner on the call screen. | no response needed |
| `note_followup` | `problem`, `advice` | Set the person's followup to this free text, so tomorrow's chat greeting and call mention it. Support free-text followups as well as the 3 preset ones. | no response needed |
| `save_weekly_check` | `sleep`, `pain`, `appetite`, `mood`, `feet`, `weight` | Build the weekly result with the existing `buildWeekly` logic and save it to Health. If `weight` is present, log it too. | a one-line summary, e.g. `"Better than last week"` |

Wrap every handler in try/catch so a bad value never crashes the call.

## 4. Call screen while connected

- Show the timer and a live **caption area**: Asha's last line in large type and the patient's last line in smaller type. Get both from the SDK's message events.
- Add a speaking indicator (a pulsing ring around Asha's avatar while she talks), a mute button and a red hang-up button.
- Show a small live "What Asha updated" list as tools fire, e.g. "✓ Amlodipine taken" or "✓ BP 132/84".
- Hang up (or the agent's `end_call`) ends the session. Then post the call-log note to the chat with duration and summary (built from the tool calls), save the transcript to the person's record, and update Today and Health.
- If the connection drops, show "Call disconnected" and offer "Call again".

## 5. Keep the demo safe

- Keep the **simulated call** as a fallback toggle in the test rail (for example "Real voice" on/off, default ON), so the demo still works if the internet or mic fails.
- Add a small badge on the call screen: "Live AI voice · ElevenLabs".
- Don't hardcode the API key anywhere in the client bundle. Grep the build output to confirm.

## 6. Done when

- [ ] `npm run dev` starts the app and the API.
- [ ] After "Fill sample", the daily call rings. Answering makes Asha greet "Namaste Ramesh ji…" in Hinglish, by voice, live.
- [ ] Saying "haan, Amlodipine le li" ticks it on the Today tab during the call.
- [ ] Saying "BP 132 by 84" logs the reading, and Health shows it on the chart.
- [ ] Saying "seene mein dard ho raha hai" makes Asha tell you to call 112, and a family alert note appears.
- [ ] Mentioning knee pain, then "Next day", makes both the chat greeting and the next call follow up on it.
- [ ] The weekly check call saves a weekly result.
- [ ] With "Real voice" turned off, the old simulated call still works.

## Later: real phone calls (not now)

When a phone number is available, import a Twilio number (or connect a SIP trunk from an Indian provider like Exotel or Plivo) into ElevenLabs and attach it to this same agent. Then add `POST /api/asha/call-phone`, which uses the ElevenLabs outbound-call API with the same dynamic variables, plus a post-call webhook route that applies the same tool effects from the transcript. The UI doesn't change.
