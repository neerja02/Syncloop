-- Versioned health knowledge (26 domains → symptoms with synonyms, language variants, the guided check that
-- handles them, warning signs and specialties) plus an audit log of every completed or escalated assessment.
-- Content is synced from lib/clinical/knowledge/registry.ts: a change bumps the version, resets the review
-- status to pending clinical review and keeps the previous content in knowledge_versions.

create table knowledge_references (
  code text primary key,
  title text not null,
  publisher text not null,
  url text not null,
  notes text,
  updated_at timestamptz not null default now()
);

create table knowledge_domains (
  code text primary key,
  number int not null unique,
  name text not null,
  education text not null,
  warning_signs text[] not null default '{}',
  specialties text[] not null default '{}',
  reference_codes text[] not null default '{}',
  content_hash text not null,
  version int not null default 1,
  review_status text not null default 'pending_clinical_review' check (review_status in ('draft','pending_clinical_review','approved','retired')),
  reviewed_by text,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table knowledge_symptoms (
  code text primary key,
  domain_code text not null references knowledge_domains(code) on delete cascade,
  display_name text not null,
  synonyms text[] not null default '{}',
  language_variants text[] not null default '{}',
  -- Which guided check handles it: a complaint ("fever"), a body area ("pain:knee"), or null for general guidance.
  guided_flow text,
  content_hash text not null,
  version int not null default 1,
  review_status text not null default 'pending_clinical_review' check (review_status in ('draft','pending_clinical_review','approved','retired')),
  reviewed_by text,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index knowledge_symptoms_domain_idx on knowledge_symptoms(domain_code);

create table knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('domain','symptom')),
  code text not null,
  version int not null,
  content jsonb not null,
  changed_at timestamptz not null default now()
);
create index knowledge_versions_code_idx on knowledge_versions(entity, code, version);

grant select on knowledge_references, knowledge_domains, knowledge_symptoms, knowledge_versions to app_user;

create table assessment_audit_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  flow text not null,
  complaint text,
  answers jsonb not null default '{}',
  red_flags text[] not null default '{}',
  care_level text not null,
  speciality text,
  possibilities text[] not null default '{}',
  rule_versions jsonb not null default '[]',
  engine_version text not null,
  created_at timestamptz not null default now()
);
create index assessment_audit_log_family_idx on assessment_audit_log(family_id, created_at desc);

alter table assessment_audit_log enable row level security;
create policy assessment_audit_log_family_access on assessment_audit_log using (app_is_family_member(family_id));
grant select, insert on assessment_audit_log to app_user;
