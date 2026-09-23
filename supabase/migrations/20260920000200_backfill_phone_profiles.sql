begin;

insert into public.phone_profiles (
  phone,
  display_name,
  username,
  bio,
  gender,
  date_of_birth,
  city,
  languages,
  interests
)
select
  identities.phone,
  nullif(trim(identities.profile ->> 'name'), ''),
  nullif(trim(identities.profile ->> 'username'), ''),
  coalesce(identities.profile ->> 'bio', ''),
  identities.profile ->> 'gender',
  coalesce(
    identities.profile ->> 'dob',
    identities.profile ->> 'date_of_birth'
  )::date,
  coalesce(identities.profile ->> 'city', ''),
  coalesce(
    array(
      select jsonb_array_elements_text(identities.profile -> 'languages')
    ),
    '{}'
  ),
  coalesce(
    array(
      select jsonb_array_elements_text(identities.profile -> 'interests')
    ),
    '{}'
  )
from public.phone_identities as identities
where identities.profile_complete
  and jsonb_typeof(identities.profile) = 'object'
  and identities.profile ->> 'gender' in ('Male', 'Female')
  and coalesce(
    identities.profile ->> 'dob',
    identities.profile ->> 'date_of_birth'
  ) ~ '^\d{4}-\d{2}-\d{2}$'
  and nullif(trim(identities.profile ->> 'name'), '') is not null
  and nullif(trim(identities.profile ->> 'username'), '') is not null
  and identities.profile ->> 'username' ~ '^[a-zA-Z0-9_]{3,20}$'
  and jsonb_typeof(identities.profile -> 'languages') = 'array'
  and jsonb_typeof(identities.profile -> 'interests') = 'array'
on conflict (phone) do nothing;

commit;
