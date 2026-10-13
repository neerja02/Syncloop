-- Kinwell core schema
-- Runs on Supabase Postgres, any Postgres 15+ with pgvector, and embedded PGlite for local development.
-- All primary keys are UUIDs. Every health entity references a profile and cascades on profile deletion,
-- so deleting a profile never leaves orphan health data behind.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Identity & accounts
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text,                       -- null when an external auth provider (e.g. Supabase Auth) owns credentials
  full_name text not null,
  role text not null default 'PATIENT' check (role in ('PATIENT','FAMILY_ADMIN','DOCTOR','ADMIN')),
  email_verified_at timestamptz,
  onboarding_completed_at timestamptz,
  country_code text not null default 'IN',
  timezone text not null default 'Asia/Kolkata',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index sessions_user_idx on sessions(user_id);

create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  email text not null,
  purpose text not null check (purpose in ('verify_email','reset_password','magic_link')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  notifications jsonb not null default '{"medication":true,"appointments":true,"daily_check_in":true,"doctor_responses":true,"reports":true,"goals":true,"email":true,"push":false}',
  location_permission text not null default 'not_asked' check (location_permission in ('not_asked','granted','denied')),
  camera_permission text not null default 'not_asked' check (camera_permission in ('not_asked','granted','denied')),
  latitude numeric,
  longitude numeric,
  location_label text,
  glucose_unit text not null default 'mg/dL' check (glucose_unit in ('mg/dL','mmol/L')),
  daily_check_in_time text default '08:30',
  large_text boolean not null default false,
  high_contrast boolean not null default false,
  reduce_motion boolean not null default false,
  updated_at timestamptz not null default now()
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  consent_type text not null check (consent_type in ('terms','privacy','ai_processing','doctor_sharing','location','notifications','research')),
  granted boolean not null,
  version text not null default '2026-10',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index consents_user_idx on consents(user_id);

-- ---------------------------------------------------------------------------
-- Families & profiles
-- ---------------------------------------------------------------------------
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references users(id) on delete set null,
  country_code text not null default 'IN',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'FAMILY_ADMIN' check (role in ('FAMILY_ADMIN','MEMBER')),
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);
create index family_memberships_user_idx on family_memberships(user_id);

create table doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  full_name text not null,
  speciality text not null,
  clinic_name text,
  clinic_address text,
  languages text[] not null default '{}',
  consultation_types text[] not null default '{in_person}',
  bio text,
  photo_url text,
  registration_number text,
  contact_hours text,
  accepting_reviews boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  display_name text not null,
  relationship text not null check (relationship in ('self','mother','father','spouse','child','sibling','grandparent','other')),
  date_of_birth date,
  sex text check (sex in ('female','male','intersex','prefer_not_to_say')),
  height_cm numeric check (height_cm is null or (height_cm > 20 and height_cm < 260)),
  weight_kg numeric check (weight_kg is null or (weight_kg > 0.5 and weight_kg < 400)),
  blood_group text,
  pregnancy_status text check (pregnancy_status in ('not_pregnant','pregnant','unknown')),
  photo_url text,
  avatar_color text not null default '#176B87',
  lifestyle jsonb not null default '{}',
  family_history text,
  previous_surgeries text,
  insurance jsonb,
  primary_doctor_id uuid references doctors(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_family_idx on profiles(family_id);

create table profile_relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  from_profile_id uuid not null references profiles(id) on delete cascade,
  to_profile_id uuid not null references profiles(id) on delete cascade,
  relationship text not null,
  created_at timestamptz not null default now()
);

create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  relationship text,
  phone text not null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
create index emergency_contacts_profile_idx on emergency_contacts(profile_id);

-- ---------------------------------------------------------------------------
-- Doctor relationships
-- ---------------------------------------------------------------------------
create table doctor_family_assignments (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index doctor_family_active_key on doctor_family_assignments(family_id) where status = 'active';
create index doctor_family_doctor_idx on doctor_family_assignments(doctor_id);

create table doctor_patient_instructions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  doctor_id uuid not null references doctors(id) on delete cascade,
  instruction_type text not null check (instruction_type in ('avoid_medicine','dose_restriction','monitoring','emergency_threshold','diet_restriction','activity_restriction','treatment_protocol','general')),
  instruction text not null,
  reason text,
  topics text[] not null default '{}',
  version integer not null default 1,
  supersedes_id uuid references doctor_patient_instructions(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dpi_profile_idx on doctor_patient_instructions(profile_id) where active;

create table doctor_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  doctor_id uuid not null references doctors(id) on delete cascade,
  review_id uuid,
  note text not null,
  created_at timestamptz not null default now()
);
create index doctor_notes_profile_idx on doctor_notes(profile_id);

create table doctor_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  doctor_id uuid not null references doctors(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  sender_user_id uuid references users(id) on delete set null,
  sender_role text not null check (sender_role in ('family','doctor')),
  body text not null check (length(body) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index doctor_messages_family_idx on doctor_messages(family_id, created_at);

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  active_profile_id uuid not null references profiles(id) on delete cascade,
  mentioned_profile_id uuid references profiles(id) on delete set null,
  profile_confidence numeric,
  title text not null default 'New health chat',
  state jsonb not null default '{}',
  archived boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_family_idx on conversations(family_id, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','doctor','system')),
  content text not null default '',
  cards jsonb not null default '[]',
  urgency text check (urgency in ('LOW','MODERATE','HIGH','EMERGENCY')),
  answer_id uuid,
  author_user_id uuid references users(id) on delete set null,
  search tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages(conversation_id, created_at);
create index messages_search_idx on messages using gin(search);

-- ---------------------------------------------------------------------------
-- Health record
-- ---------------------------------------------------------------------------
create table health_conditions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  canonical_name text,
  code text,
  status text not null default 'active' check (status in ('active','resolved','monitoring')),
  diagnosed_on date,
  notes text,
  source text not null default 'user' check (source in ('user','doctor','report','chat')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index health_conditions_profile_idx on health_conditions(profile_id);

create table allergies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  substance text not null,
  reaction text,
  severity text check (severity in ('mild','moderate','severe','unknown')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index allergies_profile_idx on allergies(profile_id);

create table report_folders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  icon text not null default 'folder',
  is_default boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index report_folders_name_key on report_folders(family_id, lower(name));

create table reports (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  folder_id uuid references report_folders(id) on delete set null,
  title text not null,
  document_type text not null default 'unknown' check (document_type in ('blood_test','prescription','imaging','discharge_summary','diabetes','cardiology','annual_checkup','other','unknown')),
  report_date date,
  doctor_name text,
  lab_name text,
  status text not null default 'uploaded' check (status in ('uploaded','processing','needs_confirmation','processed','unreadable','failed')),
  quality jsonb,
  summary text,
  raw_text text,
  extraction jsonb,
  provider text,
  doctor_reviewed_at timestamptz,
  doctor_reviewed_by uuid references doctors(id) on delete set null,
  doctor_notes text,
  uploaded_by uuid references users(id) on delete set null,
  is_demo boolean not null default false,
  search tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(raw_text,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_profile_idx on reports(profile_id, created_at desc);
create index reports_family_idx on reports(family_id, created_at desc);
create index reports_search_idx on reports using gin(search);

create table report_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  storage_key text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  sha256 text not null,
  variant text not null default 'original' check (variant in ('original','enhanced','thumbnail')),
  created_at timestamptz not null default now()
);
create index report_files_report_idx on report_files(report_id);

create table report_results (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  test_name text not null,
  canonical_name text,
  code text,
  value numeric,                 -- null whenever the value could not be read reliably. Never guessed.
  value_text text,
  unit text,
  reference_range text,
  flag text check (flag in ('low','normal','high','abnormal')),
  confidence numeric not null default 0,
  page_number integer,
  bounding_box jsonb,
  raw_text text,
  normalised_text text,
  field_type text not null default 'lab_value' check (field_type in ('lab_value','medication','dosage','date','text','measurement')),
  status text not null default 'needs_confirmation' check (status in ('confirmed','needs_confirmation','unreadable','rejected')),
  confirmed_by uuid references users(id) on delete set null,
  confirmed_at timestamptz,
  observed_at date,
  created_at timestamptz not null default now()
);
create index report_results_profile_idx on report_results(profile_id, canonical_name, observed_at);

create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  report_id uuid references reports(id) on delete set null,
  prescribed_by text,
  prescribed_on date,
  notes text,
  created_at timestamptz not null default now()
);

create table medications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  prescription_id uuid references prescriptions(id) on delete set null,
  name text not null,
  generic_name text,
  brand_name text,
  strength text,
  form text,
  frequency text,
  duration text,
  reason text,
  instructions text,
  prescribing_doctor text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active','stopped','completed')),
  original_text text,
  external_id text,
  terminology_confidence numeric,
  reminder_times text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medications_profile_idx on medications(profile_id, status);

create table measurements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  measurement_type text not null check (measurement_type in ('blood_glucose','hba1c','blood_pressure','heart_rate','temperature','weight','height','bmi','spo2','sleep_duration','steps')),
  value numeric not null,
  secondary_value numeric,
  unit text not null,
  context text check (context in ('fasting','before_meal','after_meal','random','bedtime','resting','active','morning','evening')),
  minutes_after_meal integer,
  source text not null default 'manual' check (source in ('manual','chat','report','device','doctor')),
  report_id uuid references reports(id) on delete set null,
  measured_at timestamptz not null default now(),
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index measurements_profile_type_idx on measurements(profile_id, measurement_type, measured_at desc);

create table symptoms (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  description text not null,
  concept_codes text[] not null default '{}',
  onset text,
  severity text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table health_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  category text not null default 'general' check (category in ('sleep','activity','nutrition','measurement','preventive','wellbeing','general')),
  target_value numeric,
  unit text,
  due_date date,
  progress numeric not null default 0 check (progress between 0 and 100),
  status text not null default 'active' check (status in ('active','achieved','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table check_ins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  mood text not null check (mood in ('great','okay','tired','stressed','unwell')),
  sleep_hours numeric,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Appointments & providers
-- ---------------------------------------------------------------------------
create table providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('doctor','clinic','hospital','emergency','lab','pharmacy')),
  speciality text,
  clinic text,
  address text,
  city text,
  country_code text not null default 'IN',
  latitude numeric,
  longitude numeric,
  languages text[] not null default '{}',
  consultation_types text[] not null default '{in_person}',
  phone text,
  availability text,
  source text not null default 'mock',
  external_id text,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  doctor_id uuid references doctors(id) on delete set null,
  provider_id uuid references providers(id) on delete set null,
  provider_name text,
  speciality text,
  starts_at timestamptz not null,
  duration_minutes integer not null default 20,
  location text,
  appointment_type text not null default 'in_person' check (appointment_type in ('in_person','teleconsultation','phone')),
  notes text,
  status text not null default 'requested' check (status in ('requested','confirmed','completed','cancelled')),
  discussion_points jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_profile_idx on appointments(profile_id, starts_at);
create index appointments_doctor_idx on appointments(doctor_id, starts_at);

-- ---------------------------------------------------------------------------
-- Doctor knowledge base (RAG)
-- ---------------------------------------------------------------------------
create table knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (doctor_id, name)
);

create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors(id) on delete cascade,
  source_id uuid references knowledge_sources(id) on delete set null,
  title text not null,
  category text not null,
  document_type text not null check (document_type in ('pdf','docx','txt','image','note')),
  version integer not null default 1,
  source text,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references doctors(id) on delete set null,
  status text not null default 'processing' check (status in ('processing','ready_for_review','approved','archived','failed')),
  active boolean not null default false,
  original_file_url text,          -- private storage key, never a public URL
  mime_type text,
  parsed_content text,
  embedding_status text not null default 'pending' check (embedding_status in ('pending','complete','failed')),
  chunk_count integer not null default 0,
  error text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_documents_doctor_idx on knowledge_documents(doctor_id, status);

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  doctor_id uuid not null references doctors(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector,
  embedding_model text not null,
  token_count integer,
  metadata jsonb not null default '{}',
  search tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);
create index knowledge_chunks_doctor_idx on knowledge_chunks(doctor_id);
create index knowledge_chunks_search_idx on knowledge_chunks using gin(search);

-- ---------------------------------------------------------------------------
-- Clinical configuration
-- ---------------------------------------------------------------------------
create table clinical_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  rule_kind text not null check (rule_kind in ('measurement_threshold','triage_pattern')),
  condition text,
  measurement_type text,
  context text,
  age_min integer,
  age_max integer,
  sex text,
  pregnancy_status text,
  diagnosis_status text check (diagnosis_status in ('any','diagnosed','not_diagnosed')),
  unit text,
  min_value numeric,
  max_value numeric,
  secondary_min numeric,
  secondary_max numeric,
  pattern jsonb,
  severity text not null check (severity in ('LOW','MODERATE','HIGH','EMERGENCY')),
  status_label text not null,
  recommended_action text not null,
  jurisdiction text not null default 'GLOBAL',
  source text not null,
  version integer not null default 1,
  priority integer not null default 100,
  reviewed_by text,
  reviewed_at timestamptz,
  active boolean not null default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index clinical_rules_version_key on clinical_rules(rule_key, version);
create index clinical_rules_lookup_idx on clinical_rules(rule_kind, measurement_type) where active;

-- ---------------------------------------------------------------------------
-- Doctor review workflow
-- ---------------------------------------------------------------------------
create table doctor_reviews (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  doctor_id uuid not null references doctors(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  answer_id uuid,
  requested_by uuid references users(id) on delete set null,
  summary text not null,
  symptoms jsonb not null default '[]',
  measurements jsonb not null default '[]',
  reports jsonb not null default '[]',
  ai_response text,
  knowledge_sources jsonb not null default '[]',
  question text not null,
  priority text not null default 'routine' check (priority in ('routine','soon','urgent')),
  status text not null default 'pending' check (status in ('pending','in_review','more_info_requested','responded','consultation_scheduled','closed')),
  doctor_response text,
  approved_ai_response boolean,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index doctor_reviews_doctor_idx on doctor_reviews(doctor_id, status, created_at desc);
create index doctor_reviews_profile_idx on doctor_reviews(profile_id);

-- ---------------------------------------------------------------------------
-- Notifications, audit & integrations
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  family_id uuid references families(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  kind text not null check (kind in ('medication_reminder','appointment_reminder','daily_check_in','report_processed','report_reviewed','doctor_response','doctor_message','goal_reminder','review_request','system')),
  title text not null,
  body text not null,
  link text,
  channel text not null default 'in_app' check (channel in ('in_app','email','push')),
  dedupe_key text,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);
create unique index notifications_dedupe_key on notifications(user_id, dedupe_key) where dedupe_key is not null;

create table agent_audit_logs (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null unique,
  conversation_id uuid references conversations(id) on delete cascade,
  message_id uuid,
  profile_id uuid references profiles(id) on delete cascade,
  family_id uuid references families(id) on delete cascade,
  doctor_id uuid references doctors(id) on delete set null,
  agent text not null,
  intent text,
  urgency text,
  provider text not null,
  model text not null,
  knowledge_documents_used jsonb not null default '[]',
  retrieved_chunks jsonb not null default '[]',
  clinical_rules_used jsonb not null default '[]',
  medications_referenced jsonb not null default '[]',
  doctor_instructions_used jsonb not null default '[]',
  context_sections jsonb not null default '[]',
  doctor_review_requested boolean not null default false,
  doctor_review_status text,
  created_at timestamptz not null default now()
);

create table access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  family_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index access_audit_logs_family_idx on access_audit_logs(family_id, created_at desc);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('wearable','lab','pharmacy','calendar','ehr','weather')),
  provider text not null,
  status text not null default 'disconnected' check (status in ('connected','disconnected','error')),
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, kind, provider)
);

-- Development-only outbox for verification / magic-link / reset emails when no email provider is configured.
create table dev_mailbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body text not null,
  link text,
  created_at timestamptz not null default now()
);
