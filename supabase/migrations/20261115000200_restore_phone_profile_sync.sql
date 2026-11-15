begin;

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
  verified_phone text;
  profile_gender text := input_profile ->> 'gender';
  profile_dob text := coalesce(input_profile ->> 'dob', input_profile ->> 'date_of_birth');
  profile_date date;
  profile_name text := nullif(trim(input_profile ->> 'name'), '');
  profile_username text := nullif(trim(input_profile ->> 'username'), '');
  profile_photo text := nullif(trim(input_profile ->> 'photo'), '');
  profile_bio text := trim(coalesce(input_profile ->> 'bio', ''));
  profile_city text := trim(coalesce(input_profile ->> 'city', ''));
  profile_languages text[];
  profile_interests text[];
  was_complete boolean;
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$'
     or input_profile is null or jsonb_typeof(input_profile) <> 'object' then
    raise exception 'Invalid phone identity data';
  end if;

  verified_phone := pg_catalog.regexp_replace(
    coalesce(auth.jwt() ->> 'phone', ''),
    '[^0-9]',
    '',
    'g'
  );
  if verified_phone ~ '^[0-9]{10}$' then
    verified_phone := '91' || verified_phone;
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or verified_phone is distinct from pg_catalog.regexp_replace(
         input_phone,
         '[^0-9]',
         '',
         'g'
       )
     ) then
    raise exception 'Phone identity must match the verified session';
  end if;

  if profile_gender is null or profile_gender not in ('Male', 'Female')
     or profile_dob is null
     or not pg_catalog.pg_input_is_valid(profile_dob, 'date')
     or profile_name is null or char_length(profile_name) not between 2 and 50
     or profile_username is null or profile_username !~ '^[a-zA-Z0-9_]{3,20}$'
     or char_length(profile_city) not between 2 and 80
     or char_length(profile_bio) > 500 then
    raise exception 'Invalid phone profile data';
  end if;

  if jsonb_typeof(input_profile -> 'languages') is distinct from 'array'
     or jsonb_typeof(input_profile -> 'interests') is distinct from 'array' then
    raise exception 'Invalid phone profile data';
  end if;
  if jsonb_array_length(input_profile -> 'languages') not between 1 and 4
     or jsonb_array_length(input_profile -> 'interests') not between 1 and 6 then
    raise exception 'Invalid phone profile data';
  end if;

  profile_date := profile_dob::date;
  if profile_date > current_date - interval '18 years' then
    raise exception 'You must be at least 18 years old';
  end if;

  select profile_complete into was_complete
  from public.phone_identities
  where phone = input_phone;
  if not found then
    raise exception 'Phone identity does not exist';
  end if;

  if not coalesce(was_complete, false) and (
    coalesce(input_profile ->> 'guidelinesAccepted', 'false') <> 'true'
    or coalesce(input_profile ->> 'adultAgeConfirmed', 'false') <> 'true'
  ) then
    raise exception 'Confirm that you are 18 or older and accept the community guidelines before continuing';
  end if;

  select array(select jsonb_array_elements_text(input_profile -> 'languages'))
  into profile_languages;
  select array(select jsonb_array_elements_text(input_profile -> 'interests'))
  into profile_interests;

  update public.phone_identities
  set profile = input_profile || jsonb_build_object(
        'guidelinesAccepted', true,
        'adultAgeConfirmed', true
      ),
      profile_complete = true,
      updated_at = now()
  where phone = input_phone;

  insert into public.phone_profiles
    (
      phone,
      display_name,
      username,
      bio,
      gender,
      date_of_birth,
      city,
      languages,
      interests,
      avatar_url,
      community_guidelines_accepted_at,
      adult_age_confirmed_at
    )
  values
    (
      input_phone,
      profile_name,
      profile_username,
      profile_bio,
      profile_gender,
      profile_date,
      profile_city,
      profile_languages,
      profile_interests,
      profile_photo,
      now(),
      now()
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
    avatar_url = coalesce(excluded.avatar_url, public.phone_profiles.avatar_url),
    community_guidelines_accepted_at = coalesce(
      public.phone_profiles.community_guidelines_accepted_at,
      excluded.community_guidelines_accepted_at
    ),
    adult_age_confirmed_at = coalesce(
      public.phone_profiles.adult_age_confirmed_at,
      excluded.adult_age_confirmed_at
    ),
    updated_at = now();
end;
$$;

with profile_data as materialized (
  select
    identity.phone,
    identity.profile,
    identity.profile ->> 'gender' as gender,
    coalesce(identity.profile ->> 'dob', identity.profile ->> 'date_of_birth') as dob,
    nullif(trim(identity.profile ->> 'name'), '') as display_name,
    nullif(trim(identity.profile ->> 'username'), '') as username,
    nullif(trim(identity.profile ->> 'photo'), '') as avatar_url,
    trim(coalesce(identity.profile ->> 'bio', '')) as bio,
    trim(coalesce(identity.profile ->> 'city', '')) as city
  from public.phone_identities as identity
  where identity.profile_complete
    and jsonb_typeof(identity.profile) = 'object'
),
valid_profiles as materialized (
  select
    phone,
    profile,
    gender,
    case
      when pg_catalog.pg_input_is_valid(dob, 'date') then dob::date
    end as date_of_birth,
    display_name,
    username,
    avatar_url,
    bio,
    city,
    case
      when jsonb_typeof(profile -> 'languages') = 'array'
        then array(select jsonb_array_elements_text(profile -> 'languages'))
      else array[]::text[]
    end as languages,
    case
      when jsonb_typeof(profile -> 'interests') = 'array'
        then array(select jsonb_array_elements_text(profile -> 'interests'))
      else array[]::text[]
    end as interests
  from profile_data
  where gender in ('Male', 'Female')
    and pg_catalog.pg_input_is_valid(dob, 'date')
    and display_name is not null
    and char_length(display_name) between 2 and 50
    and username ~ '^[a-zA-Z0-9_]{3,20}$'
    and char_length(city) between 2 and 80
    and case
      when jsonb_typeof(profile -> 'languages') = 'array'
        then jsonb_array_length(profile -> 'languages') between 1 and 4
      else false
    end
    and case
      when jsonb_typeof(profile -> 'interests') = 'array'
        then jsonb_array_length(profile -> 'interests') between 1 and 6
      else false
    end
    and char_length(bio) <= 500
)
insert into public.phone_profiles
  (
    phone,
    display_name,
    username,
    bio,
    gender,
    date_of_birth,
    city,
    languages,
    interests,
    avatar_url,
    community_guidelines_accepted_at,
    adult_age_confirmed_at
  )
select
  phone,
  display_name,
  username,
  bio,
  gender,
  date_of_birth,
  city,
  languages,
  interests,
  avatar_url,
  case
    when coalesce(profile ->> 'guidelinesAccepted', 'false') = 'true'
      and coalesce(profile ->> 'adultAgeConfirmed', 'false') = 'true' then now()
  end,
  case
    when coalesce(profile ->> 'guidelinesAccepted', 'false') = 'true'
      and coalesce(profile ->> 'adultAgeConfirmed', 'false') = 'true' then now()
  end
from valid_profiles
where date_of_birth <= current_date - interval '18 years'
on conflict (phone) do update set
  display_name = excluded.display_name,
  username = excluded.username,
  bio = excluded.bio,
  gender = excluded.gender,
  date_of_birth = excluded.date_of_birth,
  city = excluded.city,
  languages = excluded.languages,
  interests = excluded.interests,
  avatar_url = coalesce(excluded.avatar_url, public.phone_profiles.avatar_url),
  community_guidelines_accepted_at = coalesce(
    public.phone_profiles.community_guidelines_accepted_at,
    excluded.community_guidelines_accepted_at
  ),
  adult_age_confirmed_at = coalesce(
    public.phone_profiles.adult_age_confirmed_at,
    excluded.adult_age_confirmed_at
  ),
  updated_at = now();

commit;
