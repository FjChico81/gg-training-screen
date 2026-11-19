-- Apply only to GG FAMILY (xnvnlmmwfpdlkolukhyh).
begin;
alter table public.workouts
  add column hr_limit integer check (hr_limit between 25 and 240),
  add column revision bigint not null default 0;

create function public.gg_workout_next_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;
revoke execute on function public.gg_workout_next_revision() from public;
create trigger gg_workout_next_revision before update on public.workouts
  for each row execute function public.gg_workout_next_revision();

create policy gg_workouts_update_owner on public.workouts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant update (name, blocks, hr_limit) on public.workouts to authenticated;
commit;
