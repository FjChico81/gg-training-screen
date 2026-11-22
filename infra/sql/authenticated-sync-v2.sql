-- GG FAMILY or HF TRAINING, each in its own dedicated project.
-- IMPORTANT: Never apply this file to HPS or an unidentified database.
-- PREPARED ONLY: require confirmed project name, owner/organization, backup and approval.
-- No migration of legacy local workouts/history is performed.
begin;
create table if not exists public.training_profiles_v2 (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index if not exists training_profiles_v2_primary
  on public.training_profiles_v2 (owner_id) where is_primary;
create index if not exists training_profiles_v2_owner
  on public.training_profiles_v2 (owner_id);

create table if not exists public.training_records_v2 (
  owner_id uuid not null,
  profile_id uuid not null,
  kind text not null check (kind in ('workout','history','active','preferences')),
  client_id text not null check (length(client_id) between 1 and 128),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision between 1 and 9223372036854775807),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, profile_id, kind, client_id),
  foreign key (owner_id, profile_id)
    references public.training_profiles_v2 (owner_id, id) on delete restrict
);
create index if not exists training_records_v2_owner_profile
  on public.training_records_v2 (owner_id, profile_id, kind);

alter table public.training_profiles_v2 enable row level security;
alter table public.training_records_v2 enable row level security;
revoke all on public.training_profiles_v2 from anon, authenticated;
revoke all on public.training_records_v2 from anon, authenticated;
grant select, insert, update on public.training_profiles_v2 to authenticated;
grant select, insert, update on public.training_records_v2 to authenticated;

create policy profiles_v2_select on public.training_profiles_v2 for select to authenticated
  using ((select auth.uid()) = owner_id and (select auth.uid()) is not null);
create policy profiles_v2_insert on public.training_profiles_v2 for insert to authenticated
  with check ((select auth.uid()) = owner_id and (select auth.uid()) is not null);
create policy profiles_v2_update on public.training_profiles_v2 for update to authenticated
  using ((select auth.uid()) = owner_id and (select auth.uid()) is not null)
  with check ((select auth.uid()) = owner_id and (select auth.uid()) is not null);

create policy records_v2_select on public.training_records_v2 for select to authenticated
  using ((select auth.uid()) = owner_id and (select auth.uid()) is not null);
create policy records_v2_insert on public.training_records_v2 for insert to authenticated
  with check ((select auth.uid()) = owner_id and (select auth.uid()) is not null);
create policy records_v2_update on public.training_records_v2 for update to authenticated
  using ((select auth.uid()) = owner_id and (select auth.uid()) is not null)
  with check ((select auth.uid()) = owner_id and (select auth.uid()) is not null);
-- No DELETE grant: explicit client deletions use tombstones, with revision checks.
commit;
