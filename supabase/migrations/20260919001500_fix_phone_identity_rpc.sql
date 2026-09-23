begin;

create or replace function public.open_phone_identity(input_phone text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_complete boolean;
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$' then
    raise exception 'Invalid phone number';
  end if;
  insert into public.phone_identities(phone)
  values (input_phone)
  on conflict (phone) do nothing;
  select profile_complete into was_complete
  from public.phone_identities where phone = input_phone;
  return was_complete;
end;
$$;

create or replace function public.complete_phone_identity(
  input_phone text,
  input_profile jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$'
     or input_profile is null or jsonb_typeof(input_profile) <> 'object' then
    raise exception 'Invalid phone identity data';
  end if;
  update public.phone_identities
  set profile = input_profile, profile_complete = true, updated_at = now()
  where phone = input_phone;
  if not found then raise exception 'Phone identity does not exist'; end if;
end;
$$;

commit;
