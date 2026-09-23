begin;

alter table public.phone_profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('host-photos', 'host-photos', true)
on conflict (id) do update set public = true;

drop policy if exists host_photos_public_read on storage.objects;
create policy host_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'host-photos');

drop policy if exists host_photos_public_upload on storage.objects;
create policy host_photos_public_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'host-photos');

drop policy if exists host_photos_public_update on storage.objects;
create policy host_photos_public_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'host-photos')
  with check (bucket_id = 'host-photos');

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
  profile_gender text := input_profile ->> 'gender';
  profile_dob text := coalesce(input_profile ->> 'dob', input_profile ->> 'date_of_birth');
  profile_name text := nullif(trim(input_profile ->> 'name'), '');
  profile_username text := nullif(trim(input_profile ->> 'username'), '');
  profile_photo text := nullif(trim(input_profile ->> 'photo'), '');
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$'
     or input_profile is null or jsonb_typeof(input_profile) <> 'object'
     or profile_gender not in ('Male', 'Female')
     or profile_dob is null or profile_name is null or profile_username is null
     or profile_username !~ '^[a-zA-Z0-9_]{3,20}$'
     or jsonb_typeof(input_profile -> 'languages') <> 'array'
     or jsonb_typeof(input_profile -> 'interests') <> 'array' then
    raise exception 'Invalid phone profile data';
  end if;
  update public.phone_identities
  set profile = input_profile, profile_complete = true, updated_at = now()
  where phone = input_phone;
  if not found then raise exception 'Phone identity does not exist'; end if;
  insert into public.phone_profiles (
    phone, display_name, username, bio, gender, date_of_birth, city,
    languages, interests, avatar_url
  )
  values (
    input_phone, profile_name, profile_username, coalesce(input_profile ->> 'bio', ''),
    profile_gender, profile_dob::date, coalesce(input_profile ->> 'city', ''),
    array(select jsonb_array_elements_text(input_profile -> 'languages')),
    array(select jsonb_array_elements_text(input_profile -> 'interests')),
    profile_photo
  )
  on conflict (phone) do update set
    display_name = excluded.display_name, username = excluded.username,
    bio = excluded.bio, gender = excluded.gender, date_of_birth = excluded.date_of_birth,
    city = excluded.city, languages = excluded.languages, interests = excluded.interests,
    avatar_url = excluded.avatar_url, updated_at = now();
end;
$$;

create or replace function public.get_public_directory_profiles()
returns table (
  id text,
  display_name text,
  age smallint,
  gender text,
  city text,
  languages text[],
  interests text[],
  bio text,
  availability text,
  avatar_url text,
  accent_color text
)
language sql
security definer
set search_path = ''
as $$
  select
    'phone_' || replace(replace(replace(pp.phone, '+', ''), ' ', ''), '-', ''),
    pp.display_name,
    extract(year from age(current_date, pp.date_of_birth))::smallint,
    pp.gender,
    pp.city,
    pp.languages,
    pp.interests,
    pp.bio,
    'Available',
    pp.avatar_url,
    '#285647'
  from public.phone_profiles pp
  join public.host_applications ha on ha.phone = pp.phone
  where ha.status = 'approved'
    and pp.gender = 'Female'
    and pp.date_of_birth is not null
    and extract(year from age(current_date, pp.date_of_birth)) between 18 and 120
  order by 3 asc, 2 asc;
$$;

revoke all on function public.get_public_directory_profiles()
  from public, anon, authenticated;
grant execute on function public.get_public_directory_profiles()
  to anon, authenticated;

commit;
