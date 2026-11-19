-- DESTINO EXCLUSIVO: HF TRAINING / ydaqsmrfuwhqwqojrxyr
-- Nunca ejecutar en GG ni HPS.
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

-- HF v0: un usuario autenticado es propietario de sus rutinas.
-- Perfiles, sesiones y acceso de entrenadores quedan fuera de esta primera entrega.
