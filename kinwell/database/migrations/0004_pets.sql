-- Companion-animal profiles. A pet is a family profile with relationship 'pet' and a species, so it gets the
-- same privacy, reports and chat history as people — and vet triage instead of human triage.
alter table profiles drop constraint if exists profiles_relationship_check;
alter table profiles add constraint profiles_relationship_check
  check (relationship in ('self','mother','father','spouse','child','sibling','grandparent','other','pet'));
alter table profiles add column if not exists species text check (species is null or species in ('dog','cat','rabbit','bird','other'));
alter table profiles add column if not exists breed text;
alter table profiles add column if not exists neutered boolean;
