# Kinwell — personalised family health AI

Kinwell is a full-stack family health application. Families talk to a calm, conversational assistant about symptoms, readings, reports and medicines. Each person has a private health profile, and the family's **dedicated doctor** stays in the loop: the doctor's own protocols and patient-specific instructions are retrieved **first**, and any answer can be sent to the doctor for review in one tap.

> ⚠️ Kinwell is not a medical device and does not diagnose. The bundled clinical rules, reference text and doctor documents are **fictional demo content marked "pending clinical review"**. They must be reviewed and approved by qualified clinicians before any real-world use.

---

## Product scope: patient-first MVP

Kinwell is a **personal health agent for patients**. Chat is the product; reports provide memory, family
profiles provide context, *My Doctor* provides continuity and doctor discovery provides escalation.

- **Navigation:** Chat · Reports · Family · Profile (mobile bottom bar); narrow sidebar on desktop with chat history,
  Reports, Family and My Doctor. No dashboards, appointments, medicine management, notifications or settings pages.
- **Guided, tap-to-answer chat** (`lib/ai/guided/`): four starts — *Analyse a Report*, *Check a Symptom*,
  *Understand a Test Result*, *Ask a Health Question*. The adaptive engine (`symptom-engine.ts`) keeps structured
  state, screens for red flags after **every** answer, asks one best next question with chips / scales / multi-select /
  number entry, and ends with a care level and a doctor category ("A General Physician would be a good starting point"),
  never a diagnosis. Emergencies interrupt the chat with call / nearby-care / call-my-doctor actions.
- **Doctor discovery:** "Find a Doctor" asks for the city only when needed (or detects location), remembers it for 90 days,
  and searches the provider directory (demo listings in development).
- **My Doctor** (`/my-doctor`): a patient-maintained contact card for the family's regular doctor — not a doctor account.
- **Doctor portal:** kept in the codebase but **off** unless `ENABLE_DOCTOR_PORTAL=true` (doctor login, reviews,
  knowledge RAG and doctor guidance in answers). Legacy screens redirect (see `next.config.ts`).

The sections below describe the full platform, including the parts that are switched off in this MVP.

## Contents

1. [What the app does](#what-the-app-does)
2. [Quick start (no credentials needed)](#quick-start)
3. [Demo accounts and data](#demo-accounts-and-data)
4. [Architecture](#architecture)
5. [AI agents and orchestration](#ai-agents-and-orchestration)
6. [Doctor knowledge RAG](#doctor-knowledge-rag)
7. [Reports and OCR](#reports-and-ocr)
8. [Safety, triage and clinical rules](#safety-triage-and-clinical-rules)
9. [Security and privacy](#security-and-privacy)
10. [Database and migrations](#database-and-migrations)
11. [Environment variables](#environment-variables)
12. [Supabase setup](#supabase-setup)
13. [Adding production integrations](#adding-production-integrations)
14. [Testing](#testing)
15. [Deployment](#deployment)
16. [Project structure](#project-structure)

---

## What the app does

**Patient app**

| Area | Highlights |
| --- | --- |
| Health chat (`/app`, `/app/chat/[id]`) | Conversational home with greeting, check-in, quick actions and context cards that appear only when data exists. Every chat has an active profile ("Talking about: Mom"). Composer has upload, camera, add reading, add medicine and voice. |
| Illness & symptoms | Asks the most useful question first, one at a time, checks the record before asking, gives calm guidance, offers doctor review. |
| Measurements (`/health/measurements`) | Blood glucose (fasting / before meal / after meal / random / bedtime), HbA1c, BP, heart rate, temperature, weight, SpO₂, sleep, steps. Charts with ranges (7 days → all), context filters, rule-based status labels. |
| Reports (`/reports`, `/reports/[id]`, `/reports/folder/[id]`) | File-manager library with default and custom folders, grid/list views, filters, private previews, extracted values with Latest / Previous / Earlier, trends, doctor notes and questions for your doctor. |
| Family (`/family`, `/family/[profileId]`) | Separate profiles with photo, demographics, lifestyle, insurance, emergency contacts, doctor instructions and a searchable medical timeline. |
| Medications (`/health/medications`) | Active and past medicines, details, edit, mark as stopped, reminders, "Ask AI about this medicine". Names are checked against terminology and never changed without confirmation. |
| Appointments (`/appointments`) | Request, reschedule, cancel and add notes, plus an auto-generated "Things to discuss with your doctor". |
| My doctor (`/care`) | Doctor card, messaging, review history, choosing or changing the family doctor. |
| Providers (`/providers`) | Search by speciality, language, consultation type and distance. Factual listings only, never "best". |
| Emergency (`/emergency`) | Verified country numbers, a shareable medical summary and emergency contacts. |
| Settings | General (units, check-in time, location, accessibility), account, notifications, privacy (consents, access log, export, delete) and integrations. |
| Search (`/search`) | Global search across chats, reports, medicines, measurements, conditions and doctor notes, scoped to the family. |

**Doctor portal** (`/doctor/*`): dashboard (families, patients, cases, recent reports, AI escalations, unread questions, appointments, knowledge status), families and patients, patient view (instructions with versions, notes, charts, reports, and "what information was used" per AI answer), review workflow, knowledge base upload / approval / test search, messages, appointments, profile and clinical-rule versioning.

**Admin** (`/admin`): platform counts, AI answers by agent, security audit log and clinical rules. Admins deliberately have **no** access to patient records.

---

## Quick start

Requirements: **Node.js 20.9+** (24 LTS recommended). Nothing else is required: no Docker, no Postgres install and no API keys.

```bash
npm install
npm run db:reset   # creates the embedded Postgres database, runs migrations, seeds demo data
npm run dev        # http://localhost:3000
```

`npm run dev` also migrates and seeds automatically on first run, so `db:reset` is only needed when you want a fresh demo database. **Stop the dev server before running `db:*` scripts.** The embedded database is single-process, and the scripts refuse to run while it is locked.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build and server |
| `npm run typecheck` / `npm run lint` / `npm test` | Quality gates (`npm run check` runs all three) |
| `npm run db:migrate` | Apply new migrations (PGlite or `DATABASE_URL`) |
| `npm run db:seed` | Seed demo data into an empty database (`-- --force` to seed anyway) |
| `npm run db:reset` | Wipe the local embedded DB and file storage, then re-seed |
| `npm run samples` | Generate fictional sample files in `./samples` for trying uploads |

`./samples` contains a lab-report PDF, a clear lab photo, a **blurry** lab photo (shows unreadable values are never guessed), a prescription with a misspelt medicine ("Metfornin"), and a doctor guidance PDF for the knowledge base.

---

## Demo accounts and data

All data is fictional and marked with a **Demo** badge. The password for every account is `Demo@1234`.

| Email | Role | What to try |
| --- | --- | --- |
| `demo@kinwell.health` | Patient / family admin (Neerja, with Mom and Dad) | Chat, readings, reports, profile switching, doctor review |
| `doctor@kinwell.health` | Dr. A. Sharma, the Jain family's doctor | Reviews, knowledge base, patient instructions |
| `doctor2@kinwell.health` | Dr. R. Mehta, assigned only to the Rivera family | Cannot see the Jain family |
| `rivera@kinwell.health` | A separate family | Cannot see the Jain family |
| `admin@kinwell.health` | Platform admin | Clinical rules and audit, but no patient data |

Verification, magic-link and password-reset emails are delivered to **`/dev/mailbox`** in development.

Suggested walkthrough:

1. As the patient, type *"My sugar has been high"*, then *"184"*, *"after lunch"* and *"About 2 hours"*. You'll get a status from the versioned clinical rule, a 30-day trend, Dr. Sharma's instruction and protocol excerpts, and a **Save reading** proposal.
2. Type *"I feel better now, but my mother has a headache"*. The assistant asks *"Is this about the profile for Mom?"* before anything is attributed to her.
3. Type *"Can she take ibuprofen?"* in Mom's chat. Dr. Sharma's patient-specific NSAID restriction takes priority.
4. Type *"Can I take metfornin?"*. You'll get "Did you mean Metformin?" with **Yes / Choose another / Enter manually**.
5. Open **Reports → Lab photo — HbA1c (blurry)**. It reads *"We couldn't reliably read the complete HbA1c value"*, with **Retake / Upload clearer copy / Enter manually**.
6. Tap **Ask doctor** on any answer. Sign in as the doctor, respond in **Reviews**, then sign back in as the patient to see the reply in the chat, the record and notifications.
7. As the doctor, upload `samples/sample-doctor-guidance.pdf` in **Knowledge base**, approve it, use **Test retrieval**, then ask the patient assistant about snacks.
8. Type *"I have crushing chest pain and I'm sweating"*. The emergency card interrupts the chat, with numbers from the verified country config.

---

## Architecture

```
Next.js 16 (App Router, React 19, Server Components + Server Actions)
├── app/                     routes (patient group, doctor portal, admin, auth, API routes)
├── features/<feature>/      server actions + feature UI (chat, health, reports, family, doctor, …)
├── components/              design-system primitives (ui/), charts, brand
├── lib/
│   ├── ai/                  provider abstraction, agents, orchestrator, retrieval, composer
│   ├── clinical/            clinical rules engine, triage, report extraction, reference content, emergency config
│   ├── integrations/        storage, OCR, terminology, weather, provider search, notifications (interfaces + adapters)
│   ├── security/            sessions, auth provider, access control, crypto, rate limiting
│   ├── services/            domain services (all authorisation enforced here)
│   ├── validation/          Zod schemas
│   └── database/            Postgres / PGlite client + migration runner
├── database/migrations/     SQL migrations (schema + row-level security)
├── database/seeds/          fictional demo data, demo clinical rules, demo doctor documents
└── tests/                   Vitest suites (run against in-memory Postgres)
```

**Design principles**

- **Authorisation lives in the service layer.** Every service function calls `assertProfileAccess`, `assertFamilyAccess` or `assertDoctor` from `lib/security/access.ts`. Pages and actions never query health data directly. Row-level security policies provide defence in depth for direct database clients.
- **Provider abstraction everywhere.** `AIProvider`, `EmbeddingProvider`, `DocumentRecognitionProvider`, `MedicationTerminologyProvider`, `ClinicalTerminologyProvider`, `WeatherProvider`, `MapProvider`, `HealthcareProviderSearchProvider`, `NotificationProvider`, `EmailProvider`, `StorageProvider` and `AuthProvider` each have a development adapter and production adapters or placeholders.
- **Nothing becomes permanent medical data without confirmation.** Chat produces *record proposals* ("Save 184 mg/dL as today's after-meal reading?"). Only structured forms write directly.
- **No clinical numbers in prompts or UI.** Thresholds live in the versioned `clinical_rules` table.
- **Never invent values.** Unreadable OCR digits are stored as `value = null` with status `unreadable`. The composer rejects LLM output that introduces numbers not present in the facts.

---

## AI agents and orchestration

The orchestrator (`lib/ai/orchestrator.ts`) runs each turn through a fixed pipeline. It is not one big prompt.

```
save user message
 → Terminology Normalisation (concepts, with negation: "no chest pain" ≠ chest pain)
 → Triage/Safety Engine            ← ALWAYS first; an EMERGENCY interrupts everything
 → Family Context Agent            ← "Is this about the profile for Mom?" (never switches silently)
 → Router Agent                    ← rule-based; optional LLM structured routing (message text only)
 → Specialist agent:
     Measurement (glucose/BP slot-filling) · Illness · Medication · Medical Report ·
     Exercise · Nutrition · Sleep · Wellbeing · Daily Health Coach · Appointments ·
     Doctor Escalation · General
       ↳ Patient Medical Context Service (loads only the slices needed)
       ↳ Doctor Knowledge Retrieval Service (RAG over approved docs)
       ↳ Clinical Retrieval Service (approved reference content)
 → Zod validation of the structured AgentResponse
 → Doctor Escalation Service (adds "Send for review" when recommended)
 → Composer (LLM polish when configured; numeric-fidelity guard; locked text for emergencies)
 → Sources card ("Where this answer came from") + agent_audit_logs row
 → persist assistant message + conversation state
```

Agents return a structured `AgentResponse` (`profileId`, `intent`, `urgency`, `summary`, `clarifyingQuestions`, `possibleExplanations`, `recommendations`, `selfCare`, `redFlags`, `doctorReviewRecommended`, `doctorSpeciality`, `suggestedActions`, `medicalSources`, `doctorSources`, `recordUpdates`). This is rendered as text plus typed UI cards (`lib/ai/types.ts`) and is never shown as raw JSON.

**Retrieval priority** for every answer:

1. Patient-specific instructions from the assigned doctor (`doctor_patient_instructions`)
2. The assigned doctor's approved knowledge documents (RAG)
3. The patient's own record (conditions, allergies, medicines, measurements, reports, doctor notes)
4. Approved clinical terminology and reference content
5. Trusted external guidelines (adapter point, off by default)

### AI providers

| `AI_PROVIDER` | Behaviour |
| --- | --- |
| `mock` (default) | Deterministic development agents. Answers are fully built from rules, records and retrieval, and a **Dev AI** badge is shown. |
| `anthropic` | Official Anthropic SDK (`lib/ai/providers/anthropic.ts`), default model `claude-opus-5-5`. Server-side refusal fallbacks are enabled, structured routing uses `output_config.format` with Zod, and `stop_reason: "refusal"` is handled. |
| `openai` | Official OpenAI SDK (Responses API + structured outputs). |

If a key is missing, the app falls back to `mock` automatically. Business code depends only on the `AIProvider` interface. **Only the minimum context is sent to the AI.** The router gets the message text only, and the composer gets the deterministic draft plus a short fact summary, never the full record.

---

## Doctor knowledge RAG

1. A doctor uploads a PDF, DOCX, TXT or scanned image, or pastes text (`/doctor/knowledge`), into a category folder.
2. The original is stored privately, text is extracted (`DocumentRecognitionProvider`), split into **sentence-aligned, heading-aware chunks** with overlap, embedded (`EmbeddingProvider`) and stored in `knowledge_chunks` (`pgvector`) together with a full-text index.
3. The document status is `ready_for_review`, so **it is not used until the doctor approves it**. Approve, deactivate, archive and new versions are all supported, and versions are tracked.
4. At answer time, `searchDoctorKnowledge` runs a **hybrid search** (cosine similarity + Postgres full-text rank) over the *assigned doctor's* approved, active chunks only. The query is expanded with clinical concepts ("sugar" → glucose).
5. Retrieved passages are quoted (not paraphrased) in a "From Dr. …" card and recorded in `agent_audit_logs.knowledge_documents_used` and `retrieved_chunks`. Doctors can inspect *what information was used* on the patient page and each review.

Development embeddings are deterministic feature hashing (`kinwell-hash-512`). For production semantic search, set `EMBEDDING_PROVIDER=openai`, then re-upload or re-index documents. Chunks are tagged with `embedding_model`, so models never mix. With a fixed embedding dimension you can add an HNSW index: `create index on knowledge_chunks using hnsw ((embedding::vector(1536)) vector_cosine_ops) where embedding_model = 'text-embedding-3-small';`.

---

## Reports and OCR

Pipeline (`lib/services/reports.ts`): validate type by **magic bytes** → store the original privately → associate profile and folder → image quality assessment (resolution, brightness, contrast, Laplacian sharpness) → readability copy (auto-rotate, normalise, sharpen; **the original is always preserved**) → text recognition → document type and date detection → structured value extraction → terminology matching and medicine normalisation → per-field confidence → summary → comparison with history → confirmed glucose and HbA1c become trend measurements → notification → available for doctor review.

Each extracted field stores `raw_text`, `normalised_text`, `confidence`, `page_number`, `bounding_box` and `field_type`. Thresholds live in **one place**: `lib/config/confidence.ts` (stricter for medicine names, dosage, lab values, measurements and dates).

| `OCR_PROVIDER` | Behaviour |
| --- | --- |
| `local` (default) | Reads real text from PDFs with a text layer, DOCX and TXT. Photos and scans need an OCR engine, so a clearly-labelled **demo OCR** text is returned. Real quality metrics decide whether digits are shown as unreadable. |
| `azure` | Azure AI Document Intelligence `prebuilt-read` (implemented). |
| `google`, `aws` | Adapter placeholders with the exact integration points documented. |

---

## Safety, triage and clinical rules

- `clinical_rules` holds **versioned** measurement thresholds and triage patterns with condition, measurement type, context, age range, sex, pregnancy, diagnosis status, unit, thresholds, severity, recommended action, jurisdiction, source, version and reviewer.
- Editing a rule (doctor settings or admin) creates a **new version** and deactivates the old one. `selectMeasurementRule` uses only the newest active version, prefers jurisdiction- and diagnosis-specific rules, and for blood pressure applies "either value" logic with the most severe category winning.
- The triage engine evaluates clinician-configurable symptom patterns (`all` / `any` / measurement-plus-symptom combinations) and produces `LOW` / `MODERATE` / `HIGH` / `EMERGENCY`. It does not produce percentages.
- Emergency numbers come only from `lib/clinical/emergency-config.ts` (verified, sourced, dated), **never from model output**.
- The emergency UI uses red styling, an icon, strong text and large call buttons, plus emergency contact, nearby care and a shareable medical summary.

---

## Security and privacy

- **Auth**: scrypt password hashes; random session tokens stored only as SHA-256 hashes in `httpOnly`, `SameSite=Lax` (and `Secure` in production) cookies; magic links, email verification and password reset with single-use, expiring, hashed tokens; rate limiting on auth endpoints; and readiness for Google and Apple OAuth (buttons appear when configured).
- **Authorisation**: patients and family admins can access their own family; doctors can **read** only families with an *active* assignment and write only clinical artefacts; admins cannot read health data. Ending a doctor assignment revokes access immediately.
- **Row-level security** on every table (`database/migrations/0002_row_level_security.sql`) uses `app_current_user_id()`, which resolves from the Supabase JWT `sub` or `app.user_id`. Tests verify the policies by running queries as the restricted `app_user` role.
- **Files** are never public. `/api/files` requires a valid HMAC-signed, expiring URL **bound to the requesting user** *and* re-checks permissions on every request. Responses use `Cache-Control: private, no-store` and a restrictive CSP.
- **Audit**: `access_audit_logs` (views, uploads, downloads, deletions, denied access), shown to families under Settings → Privacy; `agent_audit_logs` for every AI answer.
- **Data rights**: consent management, JSON export (`/api/export`), report deletion (files removed from storage), profile deletion (cascades all health rows and files) and account deletion.
- Security headers are set in `next.config.ts` (HSTS, nosniff, frame-ancestors, referrer and permissions policies).

---

## Database and migrations

- `database/migrations/0001_core_schema.sql` creates 40+ tables with UUID keys and `created_at`/`updated_at`. Every health entity references a profile with `on delete cascade`.
- `database/migrations/0002_row_level_security.sql` adds helper functions, policies and the `app_user` role.
- The migration runner (`lib/database/migrate.ts`) applies each file once, in a transaction, tracked in `schema_migrations`.

The same SQL runs on embedded **PGlite** (development and tests) and on **Supabase / any Postgres 15+ with pgvector**.

---

## Environment variables

See [`.env.example`](.env.example). Nothing is required for local development. In production you **must** set `SESSION_SECRET`, `STORAGE_SIGNING_SECRET`, `CRON_SECRET` and `DATABASE_URL`.

---

## Supabase setup

1. Create a project. In **Database → Extensions**, enable `vector`.
2. Set `DATABASE_URL` to the connection string (use the pooled URL for serverless hosts), then run:

   ```bash
   npm run db:migrate
   npm run db:seed        # optional demo data
   ```

3. **Storage**: create a **private** bucket named `health-files` (or set `SUPABASE_STORAGE_BUCKET`), then set `STORAGE_PROVIDER=supabase`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Files are still delivered through Kinwell's permission-checked `/api/files` endpoint.
4. **Auth (optional)**: the built-in auth works on Supabase Postgres as-is. To use Supabase Auth instead, set `AUTH_PROVIDER=supabase` and complete the adapter in `lib/security/auth-provider.ts` with `@supabase/ssr`. Keep `users.id = auth.users.id` so RLS resolves the user from the JWT.
5. RLS is enabled by the migration. The server connects as the table owner and enforces authorisation in the service layer; any client using the anon key is constrained by the policies.

---

## Adding production integrations

Each integration is an interface with adapters. Add a class implementing the interface, then select it in the factory.

| Interface | File | Production options |
| --- | --- | --- |
| `AIProvider`, `EmbeddingProvider` | `lib/ai/providers/` | Anthropic (implemented), OpenAI (implemented) |
| `DocumentRecognitionProvider` | `lib/integrations/ocr/index.ts` | Azure (implemented), Google Document AI, AWS Textract (placeholders) |
| `MedicationTerminologyProvider` | `lib/integrations/terminology/medication.ts` | NLM RxNav (implemented, no key) |
| `ClinicalTerminologyProvider` | `lib/integrations/terminology/clinical.ts` | SNOMED CT / UMLS (placeholder) |
| `WeatherProvider` | `lib/integrations/weather/index.ts` | Open-Meteo (implemented, no key) |
| `HealthcareProviderSearchProvider`, `MapProvider` | `lib/integrations/providers/index.ts` | Google Places (implemented, needs `MAPS_API_KEY`) |
| `EmailProvider`, `NotificationProvider` | `lib/integrations/notifications/index.ts` | Resend (implemented), Web Push (placeholder) |
| `StorageProvider` | `lib/integrations/storage/index.ts` | Supabase Storage (implemented) |
| `AuthProvider` | `lib/security/auth-provider.ts` | Supabase Auth, Google and Apple OAuth (placeholder) |

The **reminder job** (`/api/cron/reminders`) creates medication, appointment and daily check-in notifications. Schedule it every 15 minutes with `Authorization: Bearer $CRON_SECRET`. Notification text is always neutral and non-diagnostic.

---

## Testing

```bash
npm test
```

There are 78 tests in 12 suites. They run against an **in-memory Postgres (PGlite) with the real migrations and the full demo seed**, and cover:

- profile switching and the family context agent
- measurement validation
- family, patient and doctor permissions, including **RLS policies under a restricted role**
- report assignment, magic-byte file validation and auto-filing
- medication normalisation and confirmation
- OCR confidence handling, so unreadable digits are never guessed
- clinical-rule selection and versioning
- triage routing and emergency interruption
- the doctor review flow end to end
- RAG approval gating, isolation between doctors, and retrieval in answers
- AI structured-output validation and the composer's numeric guard
- signed file URLs and profile deletion with no orphan rows or files
- real PDF text extraction for reports and doctor knowledge documents

---

## Deployment

**Vercel (or any Node host)**

1. Provision Postgres with pgvector (Supabase recommended) and a private storage bucket.
2. Set environment variables (`DATABASE_URL`, secrets, `STORAGE_PROVIDER=supabase`, AI keys, …).
3. Run `npm run db:migrate` once against the production database (for example from CI).
4. Deploy (`npm run build`). Add a cron job for `/api/cron/reminders` every 15 minutes, sending the `CRON_SECRET` bearer token.
5. Before launch: have clinicians review and approve all `clinical_rules` and reference content, replace the template legal pages, configure a real email provider, and swap the in-process rate limiter for a shared store (e.g. Redis) if you run more than one instance.

**Self-hosted**: `npm run build && npm start` behind a TLS-terminating proxy. The embedded PGlite database is intended for development and single-user demos only, so use Postgres in production.

---

## Project structure

```
app/(auth)            login, signup, forgot/reset password
app/(patient)         patient app (chat, health, reports, family, appointments, providers, emergency, care, settings, search, help)
app/doctor            doctor portal
app/admin             admin console
app/api               files, profile photos, export, emergency summary, cron, health check, OAuth entry
app/onboarding        6-step onboarding
features/*            server actions + feature components
lib/ai                providers, agents, orchestrator, services (retrieval, patient context, composer)
lib/clinical          rules, triage, report extraction, reference content, emergency config
lib/integrations      storage, OCR, terminology, weather, providers, notifications
lib/security          session, actor, access control, auth provider, crypto, rate limit
lib/services          domain services
database              migrations + seeds
tests                 Vitest suites
samples               fictional files for trying uploads (npm run samples)
```
