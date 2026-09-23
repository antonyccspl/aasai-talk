begin;

create or replace function public.get_phone_identity_profile(input_phone text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select profile
  from public.phone_identities
  where phone = input_phone;
$$;

revoke all on function public.get_phone_identity_profile(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_identity_profile(text)
  to anon, authenticated;

commit;
