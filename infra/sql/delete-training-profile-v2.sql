-- GG FAMILY and HF TRAINING only. Installing this function deletes no data.
begin;

create schema if not exists training_private;
revoke all on schema training_private from public, anon;
grant usage on schema training_private to authenticated;

create or replace function training_private.delete_training_profile_v2(target_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if target_profile_id is null or target_profile_id = account_id then
    return false;
  end if;

  perform 1
    from public.training_profiles_v2
    where owner_id = account_id and id = target_profile_id and not is_primary
    for update;
  if not found then
    return false;
  end if;

  delete from public.training_records_v2
    where owner_id = account_id and profile_id = target_profile_id;
  delete from public.training_profiles_v2
    where owner_id = account_id and id = target_profile_id and not is_primary;
  return true;
end;
$function$;

create or replace function public.delete_training_profile_v2(target_profile_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select training_private.delete_training_profile_v2(target_profile_id);
$function$;

revoke all on function training_private.delete_training_profile_v2(uuid) from public, anon, authenticated;
revoke all on function public.delete_training_profile_v2(uuid) from public, anon, authenticated;
grant execute on function training_private.delete_training_profile_v2(uuid) to authenticated;
grant execute on function public.delete_training_profile_v2(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
