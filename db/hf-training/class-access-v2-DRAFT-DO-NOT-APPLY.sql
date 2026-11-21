-- HF TRAINING · DISEÑO V2 · NO EJECUTAR · NO ES UNA MIGRACIÓN APROBADA
-- Exclusivamente propuesta para HF TRAINING. Nunca GG FAMILY ni HPS.
-- Sustituye conceptualmente class-live-sessions-DRAFT-DO-NOT-APPLY.sql:
-- NO ejecutar ambos. Requiere prueba en un entorno HF aislado, revisión RLS,
-- registro de roles, copia de seguridad y autorización de migración.
--
-- Vinculación: el entrenador pide enlazar una cuenta de pantalla HF exclusiva
-- (su UUID se muestra en la pantalla); esa cuenta recibe y ACEPTA la solicitud.
-- Nadie puede concederse el rol de entrenador desde el navegador.
--
-- Este SQL NO contiene políticas para Realtime: se requieren aparte canales
-- privados con RLS en realtime.messages o polling autenticado de lectura.
-- La ejecución debe revisarse con la versión actual del proyecto Supabase.
begin;

-- Roles administrativos provisionados únicamente por el administrador de HF
-- desde una vía administrativa protegida, nunca insertados por clientes web.
create table public.hf_class_actors (
  user_id uuid primary key references auth.users(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('trainer','screen')),
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp()
);
alter table public.hf_class_actors enable row level security;
revoke all on public.hf_class_actors from public, anon, authenticated;
grant select on public.hf_class_actors to authenticated;
create policy hf_class_actors_read_own on public.hf_class_actors
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Solicitudes de emparejamiento. Por defecto son NO aceptadas.
create table public.hf_class_pairings (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete restrict,
  screen_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  request_expires_at timestamptz not null,
  expires_at timestamptz not null,
  constraint hf_pair_distinct check (trainer_id <> screen_user_id),
  constraint hf_pair_request_window check (
    request_expires_at > created_at
    and request_expires_at <= created_at + interval '15 minutes'
  ),
  constraint hf_pair_lifetime check (
    expires_at > request_expires_at
    and expires_at <= created_at + interval '7 days'
  ),
  constraint hf_pair_accept_time check (
    accepted_at is null or (accepted_at >= created_at and accepted_at <= expires_at)
  )
);
create index hf_pair_trainer_idx on public.hf_class_pairings(trainer_id,expires_at);
create index hf_pair_screen_idx on public.hf_class_pairings(screen_user_id,request_expires_at);
alter table public.hf_class_pairings enable row level security;
revoke all on public.hf_class_pairings from public, anon, authenticated;
grant select on public.hf_class_pairings to authenticated;
grant insert(trainer_id,screen_user_id,request_expires_at,expires_at)
  on public.hf_class_pairings to authenticated;
grant update(accepted_at) on public.hf_class_pairings to authenticated;
-- Nota: si se concedió UPDATE de columnas adicionales por otra vía, revocarlo.

create policy hf_pair_select_actor on public.hf_class_pairings
  for select to authenticated
  using (
    (trainer_id = (select auth.uid()) and exists (
      select 1 from public.hf_class_actors a
      where a.user_id = (select auth.uid()) and a.actor_kind = 'trainer' and a.active
    ))
    or
    (screen_user_id = (select auth.uid()) and exists (
      select 1 from public.hf_class_actors a
      where a.user_id = (select auth.uid()) and a.actor_kind = 'screen' and a.active
    ))
  );
create policy hf_pair_request_by_trainer on public.hf_class_pairings
  for insert to authenticated
  with check (
    trainer_id = (select auth.uid())
    and trainer_id <> screen_user_id
    and created_at <= statement_timestamp()
    and request_expires_at > statement_timestamp()
    and exists (
      select 1 from public.hf_class_actors a
      where a.user_id = (select auth.uid()) and a.actor_kind = 'trainer' and a.active
    )
  );
create policy hf_pair_accept_only_screen on public.hf_class_pairings
  for update to authenticated
  using (
    screen_user_id = (select auth.uid())
    and accepted_at is null
    and request_expires_at > statement_timestamp()
    and exists (
      select 1 from public.hf_class_actors a
      where a.user_id = (select auth.uid()) and a.actor_kind = 'screen' and a.active
    )
  )
  with check (
    screen_user_id = (select auth.uid())
    and accepted_at is not null
    and accepted_at <= statement_timestamp()
    and expires_at > statement_timestamp()
    and exists (
      select 1 from public.hf_class_actors a
      where a.user_id = (select auth.uid()) and a.actor_kind = 'screen' and a.active
    )
  );

-- Una aceptación válida usa SIEMPRE el tiempo del servidor, no el del cliente.
create function public.hf_pair_accept_guard() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if old.accepted_at is not null
     or old.request_expires_at <= statement_timestamp()
     or exists (
       select 1 from public.hf_class_pair_revocations r where r.pair_id=old.id
     )
     or new.trainer_id is distinct from old.trainer_id
     or new.screen_user_id is distinct from old.screen_user_id
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or new.request_expires_at is distinct from old.request_expires_at then
    raise exception 'HF_PAIR_INVALID_ACCEPT' using errcode='23514';
  end if;
  new.accepted_at := statement_timestamp();
  return new;
end;
$$;
revoke execute on function public.hf_pair_accept_guard() from public, anon, authenticated;
create trigger hf_pair_accept_guard_trigger before update on public.hf_class_pairings
  for each row execute function public.hf_pair_accept_guard();

-- Revocación irreversible para entrenador O pantalla. No hay UPDATE/DELETE.
create table public.hf_class_pair_revocations (
  pair_id uuid primary key references public.hf_class_pairings(id) on delete restrict,
  revoked_by uuid not null references auth.users(id) on delete restrict,
  revoked_at timestamptz not null default statement_timestamp()
);
alter table public.hf_class_pair_revocations enable row level security;
revoke all on public.hf_class_pair_revocations from public, anon, authenticated;
grant select on public.hf_class_pair_revocations to authenticated;
grant insert(pair_id,revoked_by) on public.hf_class_pair_revocations to authenticated;
create policy hf_pair_revocation_actor_read on public.hf_class_pair_revocations
  for select to authenticated
  using (exists (
    select 1 from public.hf_class_pairings p
    where p.id=pair_id and (p.trainer_id=(select auth.uid()) or p.screen_user_id=(select auth.uid()))
  ));
create policy hf_pair_revocation_actor_insert on public.hf_class_pair_revocations
  for insert to authenticated
  with check (
    revoked_by=(select auth.uid())
    and exists (
      select 1 from public.hf_class_pairings p where p.id=pair_id
        and (p.trainer_id=(select auth.uid()) or p.screen_user_id=(select auth.uid()))
    )
  );

-- Estado público de las clases vinculado a un par ACEPTADO y NO revocado.
create table public.hf_class_live_sessions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.hf_class_pairings(id) on delete restrict,
  trainer_id uuid not null references auth.users(id) on delete restrict,
  screen_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  mode text not null check (mode in ('guided','stations')),
  public_plan jsonb not null check (jsonb_typeof(public_plan)='object'),
  runtime jsonb not null check (jsonb_typeof(runtime)='object' and runtime ? 'mode'),
  revision bigint not null default 0 check (revision>=0),
  last_command_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  constraint hf_live_mode_consistency check (runtime->>'mode'=mode),
  constraint hf_live_public_plan_format check (
    (mode='guided' and jsonb_typeof(public_plan->'guided')='array'
      and (public_plan - 'guided')='{}'::jsonb)
    or
    (mode='stations' and jsonb_typeof(public_plan->'stations')='array'
      and (public_plan - array['stations','rounds','work','change'])='{}'::jsonb)
  ),
  constraint hf_live_public_runtime_keys check (
    (runtime - array['mode','phase','step','turn','paused','deadlineUtc',
      'elapsedMs','phaseElapsedMs'])='{}'::jsonb
  ),
  constraint hf_live_payload_limits check (
    octet_length(public_plan::text)<=32768 and octet_length(runtime::text)<=4096
  ),
  constraint hf_live_duration check (
    expires_at>created_at and expires_at<=created_at + interval '12 hours'
  )
);
create index hf_live_trainer_idx on public.hf_class_live_sessions(trainer_id,expires_at);
create index hf_live_screen_idx on public.hf_class_live_sessions(screen_user_id,expires_at);
alter table public.hf_class_live_sessions enable row level security;
revoke all on public.hf_class_live_sessions from public, anon, authenticated;
grant select on public.hf_class_live_sessions to authenticated;
grant insert(pair_id,trainer_id,screen_user_id,title,mode,public_plan,runtime,expires_at)
 on public.hf_class_live_sessions to authenticated;
grant update(runtime,revision,last_command_id)
 on public.hf_class_live_sessions to authenticated;

-- Reutilizado en SELECT, INSERT y UPDATE. RLS de tabla de pares restringe
-- quién puede verificar su propia asociación; no hay SECURITY DEFINER.
-- IMPORTANTE: no confiar únicamente en este esquema hasta validar RLS con
-- cuentas reales del entorno de pruebas y auth.uid() por rol.
create policy hf_live_read_accepted_pair on public.hf_class_live_sessions
 for select to authenticated using (
  expires_at>statement_timestamp()
  and (
    trainer_id=(select auth.uid()) or screen_user_id=(select auth.uid())
  )
  and exists (
    select 1 from public.hf_class_pairings p
    where p.id=pair_id
      and p.trainer_id=hf_class_live_sessions.trainer_id
      and p.screen_user_id=hf_class_live_sessions.screen_user_id
      and p.accepted_at is not null
      and p.expires_at>statement_timestamp()
      and not exists (
        select 1 from public.hf_class_pair_revocations r where r.pair_id=p.id
      )
  )
 );
create policy hf_live_insert_trainer on public.hf_class_live_sessions
 for insert to authenticated with check (
  trainer_id=(select auth.uid())
  and expires_at>statement_timestamp()
  and exists (
    select 1 from public.hf_class_actors a
    where a.user_id=(select auth.uid()) and a.actor_kind='trainer' and a.active
  )
  and exists (
    select 1 from public.hf_class_pairings p
    where p.id=hf_class_live_sessions.pair_id
      and p.trainer_id=hf_class_live_sessions.trainer_id
      and p.screen_user_id=hf_class_live_sessions.screen_user_id
    and p.accepted_at is not null and p.expires_at>statement_timestamp()
    and not exists (select 1 from public.hf_class_pair_revocations r where r.pair_id=p.id)
  )
 );
create policy hf_live_update_trainer_only on public.hf_class_live_sessions
 for update to authenticated
 using (
  trainer_id=(select auth.uid())
  and expires_at>statement_timestamp()
  and exists (
    select 1 from public.hf_class_pairings p
    where p.id=hf_class_live_sessions.pair_id
    and p.trainer_id=hf_class_live_sessions.trainer_id
    and p.screen_user_id=hf_class_live_sessions.screen_user_id
    and p.accepted_at is not null and p.expires_at>statement_timestamp()
    and not exists (select 1 from public.hf_class_pair_revocations r where r.pair_id=p.id)
  )
 )
 with check (
  trainer_id=(select auth.uid())
  and expires_at>statement_timestamp()
  and exists (
    select 1 from public.hf_class_actors a
    where a.user_id=(select auth.uid()) and a.actor_kind='trainer' and a.active
  )
  and exists (
    select 1 from public.hf_class_pairings p
    where p.id=hf_class_live_sessions.pair_id
    and p.trainer_id=hf_class_live_sessions.trainer_id
    and p.screen_user_id=hf_class_live_sessions.screen_user_id
    and p.accepted_at is not null and p.expires_at>statement_timestamp()
    and not exists (select 1 from public.hf_class_pair_revocations r where r.pair_id=p.id)
  )
 );

create function public.hf_live_revision_guard() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.revision <> old.revision+1
    or new.last_command_id is null
    or new.last_command_id is not distinct from old.last_command_id then
    raise exception 'HF_LIVE_REVISION_OR_COMMAND_CONFLICT' using errcode='40001';
  end if;
  new.updated_at:=statement_timestamp();
  return new;
end;
$$;
revoke execute on function public.hf_live_revision_guard() from public, anon, authenticated;
create trigger hf_live_revision_guard_trigger before update on public.hf_class_live_sessions
 for each row execute function public.hf_live_revision_guard();

commit;

-- BLOQUEANTES ANTES DE APLICAR:
-- 1. No aprobar sin copia y proyecto de TEST 100% HF identificado.
-- 2. Probar grants mínimos, default privileges y opt-in Data API.
-- 3. Probar RLS por rol con PostgreSQL/pgTAP:
--    anónimo, usuario no inscrito, entrenador, pantalla asignada,
--    pantalla ajena, invitación pendiente/caducada/aceptada/revocada,
--    intento de autoaceptación del entrenador, cambios de columnas,
--    revocación por ambos, lectura y escritura con SQL real.
-- 4. Si varios entrenadores, exigir autorización institucional de alta
--    de los roles de entrenador, y limitar spam/abuso de solicitudes.
-- 5. El trigger de revisión no conserva un registro completo de commands.
--    Proponer y probar un RPC transaccional o tabla de comandos durables
--    para idempotencia completa, sin exponer SECURITY DEFINER en API.
-- 6. Elegir autorización privada de Realtime y recuperación por SELECT
--    tras reconexión; nunca confiar en Broadcast como estado de verdad.
-- 7. La aceptación implica acción explícita en la cuenta pantalla HF;
--    NO basta conocer el UUID de pantalla. No utilizar credenciales
--    personales en una TV compartida.
