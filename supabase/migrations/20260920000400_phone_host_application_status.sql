begin;

create or replace function public.get_phone_host_application_status(input_phone text)
returns text
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select status
      from public.host_applications
      where phone = input_phone
    ),
    'none'
  );
$$;

revoke all on function public.get_phone_host_application_status(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_host_application_status(text)
  to anon, authenticated;

commit;
