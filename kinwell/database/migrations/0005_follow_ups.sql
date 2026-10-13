-- Follow-up check-ins: "How are you feeling now?" asked inside the conversation the next time the patient
-- opens Kinwell after the due time (no push notifications in the MVP).
create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  topic text not null,
  speciality text,
  due_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','asked','done','cancelled')),
  outcome text check (outcome is null or outcome in ('better','same','worse','new')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index follow_ups_due_idx on follow_ups(family_id, status, due_at);

alter table follow_ups enable row level security;
create policy follow_ups_family_access on follow_ups using (app_is_family_member(family_id));
grant select, insert, update, delete on follow_ups to app_user;
