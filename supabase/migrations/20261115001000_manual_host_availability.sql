begin;

create or replace function public.phone_host_is_online(input_host_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.phone_host_presence presence
    where presence.host_phone = input_host_phone
      and presence.accepting_calls
  );
$$;

revoke all on function public.phone_host_is_online(text)
  from public, anon, authenticated;
grant execute on function public.phone_host_is_online(text)
  to service_role;

notify pgrst, 'reload schema';
commit;
