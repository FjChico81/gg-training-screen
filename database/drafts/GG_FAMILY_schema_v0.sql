-- DESTINO EXCLUSIVO: GG FAMILY / xnvnlmmwfpdlkolukhyh
-- Nunca ejecutar en HF ni HPS.
-- BORRADOR PARA REVISIÓN. NO EJECUTADO. NO ES MIGRACIÓN APROBADA.
-- Requiere comprobar el proyecto de destino y hacer pruebas RLS antes de producción.
create extension if not exists pgcrypto;
create table public.workouts (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 title text not null check (char_length(trim(title)) between 1 and 120),
 blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks)='array'),
 revision integer not null default 1 check (revision > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index workouts_owner_idx on public.workouts(owner_user_id,updated_at desc);
alter table public.workouts enable row level security;
revoke all on public.workouts from anon, authenticated;
grant select, insert on public.workouts to authenticated;
create policy workouts_read_own on public.workouts for select to authenticated
 using (owner_user_id = (select auth.uid()));
create policy workouts_insert_own on public.workouts for insert to authenticated
 with check (owner_user_id = (select auth.uid()) and revision = 1 and deleted_at is null);
-- UPDATE/DELETE intencionadamente bloqueados en este borrador.
-- Pendiente RPC con control optimista de revision y validación de propiedad.

create table public.family_profiles (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 display_name text not null check (char_length(trim(display_name)) between 1 and 80),
 is_minor boolean not null default false,
 created_at timestamptz not null default now(),
 unique(id,owner_user_id)
);
alter table public.family_profiles enable row level security;
revoke all on public.family_profiles from anon,authenticated;
grant select,insert on public.family_profiles to authenticated;
create policy family_profiles_read on public.family_profiles for select to authenticated
 using (owner_user_id=(select auth.uid()));
create policy family_profiles_insert on public.family_profiles for insert to authenticated
 with check (owner_user_id=(select auth.uid()));
create table public.workout_assignments (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 workout_id uuid not null references public.workouts(id) on delete restrict,
 profile_id uuid not null,
 assigned_at timestamptz not null default now(),
 unique(workout_id,profile_id),
 foreign key(profile_id,owner_user_id) references public.family_profiles(id,owner_user_id)
);
alter table public.workout_assignments enable row level security;
revoke all on public.workout_assignments from anon,authenticated;
grant select,insert on public.workout_assignments to authenticated;
create policy assignments_read on public.workout_assignments for select to authenticated
 using (owner_user_id=(select auth.uid()) and exists
 (select 1 from public.workouts w where w.id=workout_id and w.owner_user_id=(select auth.uid())));
create policy assignments_insert on public.workout_assignments for insert to authenticated
 with check (owner_user_id=(select auth.uid()) and exists
 (select 1 from public.workouts w where w.id=workout_id and w.owner_user_id=(select auth.uid())));
-- Alcance v0: un adulto propietario; múltiples adultos, sesiones e historiales se diseñarán después.
