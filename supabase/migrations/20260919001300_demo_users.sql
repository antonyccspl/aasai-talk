begin;

create table if not exists public.demo_users (
  phone text primary key check (phone ~ '^\+91[0-9]{10}$'),
  profile_complete boolean not null default false,
  profile jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.demo_users enable row level security;
revoke all on public.demo_users from public, anon, authenticated;
grant all on public.demo_users to service_role;

create or replace function public.open_demo_user(input_phone text)
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
  insert into public.demo_users(phone)
  values (input_phone)
  on conflict (phone) do nothing;
  select profile_complete into was_complete
  from public.demo_users where phone = input_phone;
  return was_complete;
end;
$$;

create or replace function public.complete_demo_user(input_phone text, input_profile jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$'
     or input_profile is null or jsonb_typeof(input_profile) <> 'object' then
    raise exception 'Invalid demo user data';
  end if;
  update public.demo_users
  set profile = input_profile, profile_complete = true, updated_at = now()
  where phone = input_phone;
  if not found then raise exception 'Demo user does not exist'; end if;
end;
$$;

revoke all on function public.open_demo_user(text), public.complete_demo_user(text, jsonb)
from public, anon, authenticated;
grant execute on function public.open_demo_user(text), public.complete_demo_user(text, jsonb)
to anon, authenticated;

commit;
