-- Target: HF TRAINING (ydaqsmrfuwhqwqojrxyr).
begin;
create table public.workouts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  hr_limit integer check (hr_limit between 25 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 0,
  deleted_at timestamptz
);

create index hf_workouts_owner_id on public.workouts (user_id, id);
alter table public.workouts enable row level security;
revoke all on public.workouts from public, anon, authenticated;
grant select on public.workouts to authenticated;
grant insert (id, user_id, name, blocks, hr_limit) on public.workouts to authenticated;
grant update (name, blocks, hr_limit, deleted_at) on public.workouts to authenticated;

create policy hf_workouts_select on public.workouts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hf_workouts_insert on public.workouts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hf_workouts_update on public.workouts for update to authenticated
  using (deleted_at is null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.hf_workout_next_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;
revoke execute on function public.hf_workout_next_revision() from public, anon, authenticated;
create trigger hf_workout_next_revision before update on public.workouts
  for each row execute function public.hf_workout_next_revision();
commit;
