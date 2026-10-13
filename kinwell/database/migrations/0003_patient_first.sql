-- Patient-first MVP
--
-- "My Doctor": a patient-maintained contact card for the family's regular doctor. This is NOT a doctor
-- account — the doctor never signs in and nothing is shared with them.
create table my_doctors (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  name text not null,
  photo_path text,
  specialisation text,
  clinic_name text,
  phone text,
  alt_phone text,
  email text,
  address text,
  city text,
  state text,
  pincode text,
  consultation_hours text,
  emergency_phone text,
  notes text,
  last_visit_date date,
  next_follow_up date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One regular doctor per family keeps the experience simple.
create unique index my_doctors_family_idx on my_doctors(family_id);

alter table my_doctors enable row level security;
create policy my_doctors_family_access on my_doctors using (app_is_family_member(family_id));
grant select, insert, update, delete on my_doctors to app_user;

-- City for doctor discovery. Asked only when the patient wants to find a doctor, then remembered.
alter table user_preferences add column if not exists city text;
alter table user_preferences add column if not exists city_updated_at timestamptz;
