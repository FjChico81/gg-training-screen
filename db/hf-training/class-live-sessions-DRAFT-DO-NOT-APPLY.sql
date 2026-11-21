-- SUPERADO POR class-access-v2-DRAFT-DO-NOT-APPLY.sql
-- ARCHIVO CONSERVADO PARA HISTORIAL: NO EJECUTAR Y NO COMBINAR CON V2.
-- V1 carece de consentimiento explícito y revocación de pantalla.
-- HF TRAINING · BORRADOR TÉCNICO / NO EJECUTAR
-- Propuesta independiente para sincronizar un entrenador autenticado con una
-- cuenta de pantalla autenticada, sin compartir credenciales ni perfiles.
-- NO desplegado. Requiere revisión de esquemas, backup, pgTAP, RLS y autorización
-- explícita antes de ejecutarlo sobre HF TRAINING.
-- Destino exclusivo futuro: HF TRAINING. NUNCA GG FAMILY NI HPS.
--
-- Primera versión: cada pantalla se autentica con una cuenta HF distinta
-- del entrenador, y el entrenador registra el ID de esa cuenta como destinatario.
-- El canal de distribución de ese ID y el emparejamiento se diseñarán en UI.
-- La pantalla solo recibe datos públicos de la clase. No hay FC ni perfiles.
--
-- Protocolo de escritura futuro:
-- UPDATE ... SET runtime=..., revision=revision+1,
--   last_command_id=<nuevo uuid> WHERE id=<sesión> AND revision=<revision leída>
-- SELECT ... revision ... -> comprobar exactamente una fila afectada.
-- No hacer reintentos a ciegas cuando el resultado sea incierto.
--
-- Atención: esto es una propuesta a comprobar en un entorno aislado antes de aplicarla.
-- El emparejamiento con aceptación expresa de la cuenta pantalla sigue PENDIENTE.
-- No aplicar este borrador sin resolver el consentimiento de vinculación.
-- Comprobar exposición explícita en Data API: GRANT+RLS no garantizan por sí solos
-- la disponibilidad del endpoint REST en todos los proyectos (cambio 2026).

begin;

create table public.hf_class_live_sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users (id) on delete restrict,
  screen_user_id uuid not null references auth.users (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  mode text not null check (mode in ('guided', 'stations')),
  public_plan jsonb not null check (jsonb_typeof(public_plan) = 'object'),
  runtime jsonb not null check (jsonb_typeof(runtime) = 'object'),
  constraint hf_class_runtime_mode check (runtime ? 'mode' and runtime->>'mode' = mode),
  revision bigint not null default 0 check (revision >= 0),
  last_command_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint hf_class_distinct_accounts check (trainer_id <> screen_user_id),
  constraint hf_class_valid_expiry check (expires_at > created_at)
);

create index hf_class_live_trainer on public.hf_class_live_sessions (trainer_id, expires_at);
create index hf_class_live_screen on public.hf_class_live_sessions (screen_user_id, expires_at);

alter table public.hf_class_live_sessions enable row level security;
revoke all on table public.hf_class_live_sessions from public, anon, authenticated;
grant select on table public.hf_class_live_sessions to authenticated;
grant insert (trainer_id, screen_user_id, title, mode, public_plan, runtime, expires_at)
  on table public.hf_class_live_sessions to authenticated;
grant update (public_plan, runtime, revision, last_command_id, expires_at)
  on table public.hf_class_live_sessions to authenticated;

-- Unicamente el entrenador y la cuenta específica de esa pantalla pueden leer.
create policy hf_class_live_select on public.hf_class_live_sessions
 for select to authenticated
 using (
   expires_at > statement_timestamp()
   and (
     trainer_id = (select auth.uid())
     or screen_user_id = (select auth.uid())
   )
 );

-- La pantalla no puede crear sesiones; quien las crea debe ser su entrenador.
create policy hf_class_live_insert on public.hf_class_live_sessions
 for insert to authenticated
 with check (
   trainer_id = (select auth.uid())
   and trainer_id <> screen_user_id
   and expires_at > statement_timestamp()
   and expires_at <= statement_timestamp() + interval '24 hours'
 );

-- Solo el entrenador puede cambiar el estado; ni trainer_id ni screen_user_id
-- son columnas editables desde el navegador.
create policy hf_class_live_update on public.hf_class_live_sessions
 for update to authenticated
 using (
   trainer_id = (select auth.uid())
   and expires_at > statement_timestamp()
 )
 with check (
   trainer_id = (select auth.uid())
   and trainer_id <> screen_user_id
   and expires_at > statement_timestamp()
   and expires_at <= statement_timestamp() + interval '24 hours'
 );

-- El cliente no puede rebajar revisiones ni repetir de inmediato el mismo ID.
-- No se concede UPDATE directo de updated_at ni de las identidades.
create function public.hf_class_live_revision_guard()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'HF_CLASS_REVISION_CONFLICT' using errcode = '40001';
  end if;

  if new.last_command_id is null
     or new.last_command_id is not distinct from old.last_command_id then
    raise exception 'HF_CLASS_COMMAND_ID_REQUIRED' using errcode = '23514';
  end if;

  new.updated_at := statement_timestamp();
  return new;
end
$$;

revoke all on function public.hf_class_live_revision_guard() from public, anon, authenticated;
create trigger hf_class_live_revision_guard
  before update on public.hf_class_live_sessions
  for each row execute function public.hf_class_live_revision_guard();

commit;

-- TODO en implantación aprobada, NO en este borrador:
-- 1. Test pgTAP: anon denegado; pantalla solo SELECT de sus sesiones; entrenador
--    modifica solo sus propias sesiones; tercero no ve ni escribe.
-- 2. Confirmar limitaciones del Data API, grants y Realtime publication.
-- 3. Aplicar en un proyecto HF de pruebas, nunca directamente en producción.
-- 4. Validar payload público por lista positiva en la capa de aplicación.
-- 5. Comprobar reconexión y conflictos; CAS + UUID evita doble clic inmediato,
--    pero la idempotencia completa requiere guardar comandos o RPC transaccional.
-- 6. Verificar recuperación tras corte de red, caducidad y limpieza programada.
