begin;

create or replace function public.record_phone_member_heartbeat(input_member_phone text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  heartbeat_at timestamptz;
begin
  if input_member_phone is null
     or input_member_phone !~ '^[+]91[0-9]{10}$'
     or not exists (
       select 1
       from public.phone_profiles profile
       where profile.phone = input_member_phone
         and profile.gender = 'Male'
     ) then
    raise exception 'Invalid male member presence heartbeat';
  end if;

  insert into public.phone_user_presence (phone, last_seen_at)
  values (input_member_phone, clock_timestamp())
  on conflict (phone) do update
    set last_seen_at = excluded.last_seen_at
  returning last_seen_at into heartbeat_at;

  return heartbeat_at;
end;
$$;

revoke all on function public.record_phone_member_heartbeat(text)
  from public, anon, authenticated;
grant execute on function public.record_phone_member_heartbeat(text)
  to service_role;

commit;
