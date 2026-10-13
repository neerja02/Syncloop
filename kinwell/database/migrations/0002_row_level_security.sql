-- Row Level Security
--
-- Defence in depth: the Kinwell server enforces authorisation in lib/security/access.ts for every
-- query it makes. These policies additionally protect the data if any client ever connects with a
-- non-owner role (e.g. Supabase's `authenticated` role through PostgREST / supabase-js).
--
-- The current user is resolved from Supabase's JWT claims, or from the `app.user_id` setting
-- (used by the test-suite and any server code that opts into `set local role app_user`).

create or replace function app_current_user_id() returns uuid
language sql stable as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', ''),
    nullif(current_setting('app.user_id', true), '')
  )::uuid
$$;

create or replace function app_is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_memberships m where m.family_id = fid and m.user_id = app_current_user_id())
$$;

create or replace function app_is_assigned_doctor(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from doctor_family_assignments a
    join doctors d on d.id = a.doctor_id
    where a.family_id = fid and a.status = 'active' and d.user_id = app_current_user_id()
  )
$$;

create or replace function app_can_access_family(fid uuid) returns boolean
language sql stable as $$
  select app_is_family_member(fid) or app_is_assigned_doctor(fid)
$$;

create or replace function app_can_access_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = pid and app_can_access_family(p.family_id))
$$;

create or replace function app_doctor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from doctors where user_id = app_current_user_id()
$$;

-- Role used by tests (and optionally the server) to run queries under RLS.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end $$;
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;

-- Users can see themselves.
alter table users enable row level security;
create policy users_self on users using (id = app_current_user_id());

alter table user_preferences enable row level security;
create policy prefs_self on user_preferences using (user_id = app_current_user_id());

alter table consents enable row level security;
create policy consents_self on consents using (user_id = app_current_user_id());

alter table notifications enable row level security;
create policy notifications_self on notifications using (user_id = app_current_user_id());

alter table integrations enable row level security;
create policy integrations_self on integrations using (user_id = app_current_user_id());

alter table sessions enable row level security;
create policy sessions_self on sessions using (user_id = app_current_user_id());

alter table auth_tokens enable row level security;     -- no policy: server only
alter table dev_mailbox enable row level security;     -- no policy: server only
alter table access_audit_logs enable row level security; -- no policy: server/admin only

-- Families
alter table families enable row level security;
create policy families_access on families using (app_can_access_family(id));

alter table family_memberships enable row level security;
create policy memberships_access on family_memberships using (app_can_access_family(family_id));

-- Family-scoped tables
do $$
declare t text;
begin
  foreach t in array array['profile_relationships','conversations','report_folders','reports','appointments','doctor_reviews','doctor_messages','doctor_family_assignments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I using (app_can_access_family(family_id))', t || '_family_access', t);
  end loop;
end $$;

alter table profiles enable row level security;
create policy profiles_access on profiles using (app_can_access_family(family_id));

-- Profile-scoped health tables
do $$
declare t text;
begin
  foreach t in array array['emergency_contacts','health_conditions','allergies','medications','prescriptions','measurements','symptoms','health_goals','check_ins','report_results','doctor_patient_instructions','doctor_notes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I using (app_can_access_profile(profile_id))', t || '_profile_access', t);
  end loop;
end $$;

-- Messages follow their conversation
alter table messages enable row level security;
create policy messages_access on messages using (
  exists (select 1 from conversations c where c.id = conversation_id and app_can_access_family(c.family_id))
);

alter table report_files enable row level security;
create policy report_files_access on report_files using (
  exists (select 1 from reports r where r.id = report_id and app_can_access_family(r.family_id))
);

-- Doctors: anyone signed in may read doctor directory rows; only the doctor may modify their own.
alter table doctors enable row level security;
create policy doctors_read on doctors for select using (app_current_user_id() is not null);
create policy doctors_write on doctors for update using (user_id = app_current_user_id());

-- Knowledge base: only the owning doctor manages documents. Patient retrieval happens server-side.
alter table knowledge_sources enable row level security;
create policy knowledge_sources_owner on knowledge_sources using (doctor_id = app_doctor_id());
alter table knowledge_documents enable row level security;
create policy knowledge_documents_owner on knowledge_documents using (doctor_id = app_doctor_id());
alter table knowledge_chunks enable row level security;
create policy knowledge_chunks_owner on knowledge_chunks using (doctor_id = app_doctor_id());

-- Clinical rules: readable by signed-in users, writable server-side only.
alter table clinical_rules enable row level security;
create policy clinical_rules_read on clinical_rules for select using (app_current_user_id() is not null);

-- Providers directory: readable by signed-in users.
alter table providers enable row level security;
create policy providers_read on providers for select using (app_current_user_id() is not null);

-- Audit logs: visible to the family and their doctor.
alter table agent_audit_logs enable row level security;
create policy agent_audit_access on agent_audit_logs for select using (app_can_access_family(family_id));
