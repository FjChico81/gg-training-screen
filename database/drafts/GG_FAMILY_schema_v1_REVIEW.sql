-- DESTINO ÚNICO GG FAMILY: xnvnlmmwfpdlkolukhyh
-- HPS ABSOLUTAMENTE EXCLUIDO.
-- BORRADOR v1. NO EJECUTAR SIN REVISIÓN Y PRUEBAS.
-- Requiere un proyecto Supabase nuevo, previamente identificado.
create table public.workouts (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 title text not null check (char_length(btrim(title)) between 1 and 120),
 blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks)='array' and pg_column_size(blocks)<=262144),
 revision integer not null default 1 check (revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 unique(id,owner_user_id)
);
create index workouts_owner_updated_idx on public.workouts(owner_user_id,updated_at desc);
alter table public.workouts enable row level security;
revoke all on public.workouts from public,anon,authenticated;
grant select,insert on public.workouts to authenticated;
grant update(title,blocks,revision,deleted_at) on public.workouts to authenticated;
create policy workouts_select_owner on public.workouts for select to authenticated using (owner_user_id=(select auth.uid()));
create policy workouts_insert_owner on public.workouts for insert to authenticated
 with check (owner_user_id=(select auth.uid()) and revision=1 and deleted_at is null);
create policy workouts_update_owner on public.workouts for update to authenticated
 using (owner_user_id=(select auth.uid()) and deleted_at is null)
 with check (owner_user_id=(select auth.uid()));
-- Trigger valida revision y metadatos, incluso si un cliente intenta modificar directamente.
create function public.workouts_guard_update() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.owner_user_id is distinct from old.owner_user_id
 or new.created_at is distinct from old.created_at then
  raise exception 'immutable workout fields' using errcode='23514';
 end if;
 if new.revision <> old.revision + 1 then
  raise exception 'invalid workout revision' using errcode='23514';
 end if;
 new.updated_at := now();
 return new;
end $$;
revoke all on function public.workouts_guard_update() from public,anon,authenticated;
create trigger workouts_guard_before_update before update on public.workouts
 for each row execute function public.workouts_guard_update();
-- Cliente: UPDATE ... WHERE id=:id AND revision=:expected_revision, comprobar 1 fila.
-- Si devuelve 0 filas: conflicto o ausencia, NUNCA sobrescribir automáticamente.
-- El borrado físico no se concede; deleted_at se usa como borrado lógico.

create table public.family_profiles (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
 is_minor boolean not null default false,
 created_at timestamptz not null default now(),
 unique(id,owner_user_id)
);
alter table public.family_profiles enable row level security;
revoke all on public.family_profiles from public,anon,authenticated;
grant select,insert on public.family_profiles to authenticated;
create policy profiles_select_owner on public.family_profiles for select to authenticated using (owner_user_id=(select auth.uid()));
create policy profiles_insert_owner on public.family_profiles for insert to authenticated with check (owner_user_id=(select auth.uid()));
create table public.workout_assignments (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 workout_id uuid not null,
 profile_id uuid not null,
 assigned_at timestamptz not null default now(),
 unique(workout_id,profile_id),
 foreign key(workout_id,owner_user_id) references public.workouts(id,owner_user_id) on delete restrict,
 foreign key(profile_id,owner_user_id) references public.family_profiles(id,owner_user_id) on delete restrict
);
alter table public.workout_assignments enable row level security;
revoke all on public.workout_assignments from public,anon,authenticated;
grant select,insert on public.workout_assignments to authenticated;
create policy assignments_select_owner on public.workout_assignments for select to authenticated using (owner_user_id=(select auth.uid()));
create policy assignments_insert_owner on public.workout_assignments for insert to authenticated with check (owner_user_id=(select auth.uid()));
-- Primer alcance: adulto único. No habilitar uso multiadulto sin nuevo diseño.
