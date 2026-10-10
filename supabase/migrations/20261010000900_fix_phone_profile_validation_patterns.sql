begin;

-- Use character classes here so valid phone numbers and ISO dates cannot be
-- rejected by escape interpretation in PostgreSQL regular expressions.
create or replace function public.complete_phone_identity(input_phone text, input_profile jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_gender text := input_profile ->> 'gender';
  profile_dob text := coalesce(input_profile ->> 'dob', input_profile ->> 'date_of_birth');
  profile_name text := nullif(trim(input_profile ->> 'name'), '');
  profile_username text := nullif(trim(input_profile ->> 'username'), '');
  profile_photo text := nullif(trim(input_profile ->> 'photo'), '');
  profile_bio text := trim(coalesce(input_profile ->> 'bio', ''));
  profile_city text := trim(coalesce(input_profile ->> 'city', ''));
  was_complete boolean;
begin
  if input_phone is null or input_phone !~ '^[+]91[0-9]{10}$'
     or input_profile is null or jsonb_typeof(input_profile) <> 'object'
     or profile_gender not in ('Male', 'Female') or profile_dob is null
     or profile_dob !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or profile_name is null or char_length(profile_name) not between 2 and 50
     or profile_username is null or profile_username !~ '^[a-zA-Z0-9_]{3,20}$'
     or char_length(profile_city) not between 2 and 80
     or jsonb_typeof(input_profile -> 'languages') <> 'array'
     or jsonb_typeof(input_profile -> 'interests') <> 'array'
     or jsonb_array_length(input_profile -> 'languages') not between 1 and 4
     or jsonb_array_length(input_profile -> 'interests') not between 1 and 6
     or char_length(profile_bio) > 500 then
    raise exception 'Invalid phone profile data';
  end if;

  select profile_complete into was_complete
  from public.phone_identities
  where phone = input_phone;
  if not found then raise exception 'Phone identity does not exist'; end if;

  if not coalesce(was_complete, false) and (
    coalesce(input_profile ->> 'guidelinesAccepted', 'false') <> 'true'
    or coalesce(input_profile ->> 'adultAgeConfirmed', 'false') <> 'true'
  ) then
    raise exception 'Confirm that you are 18 or older and accept the community guidelines before continuing';
  end if;

  update public.phone_identities
  set profile = input_profile || jsonb_build_object('guidelinesAccepted', true, 'adultAgeConfirmed', true),
      profile_complete = true,
      updated_at = now()
  where phone = input_phone;

  insert into public.phone_profiles
    (phone, display_name, username, bio, gender, date_of_birth, city, languages, interests, avatar_url, community_guidelines_accepted_at, adult_age_confirmed_at)
  values
    (input_phone, profile_name, profile_username, profile_bio, profile_gender, profile_dob::date, profile_city,
     array(select jsonb_array_elements_text(input_profile -> 'languages')),
     array(select jsonb_array_elements_text(input_profile -> 'interests')),
     profile_photo, now(), now())
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
    community_guidelines_accepted_at = coalesce(public.phone_profiles.community_guidelines_accepted_at, excluded.community_guidelines_accepted_at),
    adult_age_confirmed_at = coalesce(public.phone_profiles.adult_age_confirmed_at, excluded.adult_age_confirmed_at),
    updated_at = now();
end;
$$;

commit;
