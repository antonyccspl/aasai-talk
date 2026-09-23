begin;

create table if not exists public.phone_profiles (
  phone text primary key references public.phone_identities(phone) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  username text check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  bio text not null default '' check (length(bio) <= 500),
  gender text not null check (gender in ('Male', 'Female')),
  date_of_birth date not null,
  city text not null default '',
  languages text[] not null default '{}',
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.enforce_phone_profile_adult()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'You must be at least 18 years old' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_phone_profile_adult on public.phone_profiles;
create trigger enforce_phone_profile_adult
before insert or update on public.phone_profiles
for each row execute function public.enforce_phone_profile_adult();

alter table public.phone_profiles enable row level security;
revoke all on public.phone_profiles from public, anon, authenticated;
grant all on public.phone_profiles to service_role;
revoke all on function public.enforce_phone_profile_adult() from public, anon, authenticated;

create or replace function public.complete_phone_identity(
  input_phone text,
  input_profile jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_gender text;
  profile_dob text;
  profile_name text;
  profile_username text;
  profile_bio text;
  profile_city text;
  profile_languages text[];
  profile_interests text[];
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$'
     or input_profile is null or jsonb_typeof(input_profile) <> 'object' then
    raise exception 'Invalid phone identity data';
  end if;

  profile_gender := input_profile ->> 'gender';
  profile_dob := coalesce(input_profile ->> 'dob', input_profile ->> 'date_of_birth');
  profile_name := nullif(trim(input_profile ->> 'name'), '');
  profile_username := nullif(trim(input_profile ->> 'username'), '');
  profile_bio := coalesce(input_profile ->> 'bio', '');
  profile_city := coalesce(input_profile ->> 'city', '');

  if profile_gender not in ('Male', 'Female')
     or profile_dob is null
     or profile_dob !~ '^\d{4}-\d{2}-\d{2}$'
     or profile_name is null
     or profile_username is null
     or profile_username !~ '^[a-zA-Z0-9_]{3,20}$'
     or jsonb_typeof(input_profile -> 'languages') <> 'array'
     or jsonb_typeof(input_profile -> 'interests') <> 'array' then
    raise exception 'Invalid phone profile data';
  end if;

  select array_agg(value order by ordinality)
  into profile_languages
  from jsonb_array_elements_text(input_profile -> 'languages')
    with ordinality as items(value, ordinality);

  select array_agg(value order by ordinality)
  into profile_interests
  from jsonb_array_elements_text(input_profile -> 'interests')
    with ordinality as items(value, ordinality);

  if not exists (
    select 1 from public.phone_identities where phone = input_phone
  ) then
    raise exception 'Phone identity does not exist';
  end if;

  insert into public.phone_profiles (
    phone, display_name, username, bio, gender, date_of_birth, city,
    languages, interests
  )
  values (
    input_phone, profile_name, profile_username, profile_bio, profile_gender,
    profile_dob::date, profile_city, coalesce(profile_languages, '{}'),
    coalesce(profile_interests, '{}')
  )
  on conflict (phone) do update set
    display_name = excluded.display_name,
    username = excluded.username,
    bio = excluded.bio,
    gender = excluded.gender,
    date_of_birth = excluded.date_of_birth,
    city = excluded.city,
    languages = excluded.languages,
    interests = excluded.interests,
    updated_at = now();

  update public.phone_identities
  set profile = input_profile, profile_complete = true, updated_at = now()
  where phone = input_phone;
end;
$$;

commit;
