-- GG FAMILY (xnvnlmmwfpdlkolukhyh)
begin;
alter table public.workouts add column deleted_at timestamptz;
grant update (deleted_at) on public.workouts to authenticated;
-- Keep archived rows visible to their owner so other devices receive the tombstone.
-- This restrictive policy supplements the existing owner-only UPDATE policy.
create policy gg_workouts_update_live
  on public.workouts as restrictive for update to authenticated
  using (deleted_at is null)
  with check (true);
commit;
