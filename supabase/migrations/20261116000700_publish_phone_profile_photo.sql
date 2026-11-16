begin;

drop policy if exists host_photos_public_upload on storage.objects;
drop policy if exists host_photos_public_update on storage.objects;

drop function if exists public.review_admin_profile_photo(
  uuid, uuid, text, text, text
);
drop function if exists public.get_moderator_profile_photo_queue(uuid);
drop function if exists public.review_moderator_profile_photo(
  uuid, uuid, text, text, text
);

create or replace function public.publish_phone_profile_photo(
  input_phone text,
  input_public_photo_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Profile photo service access is required';
  end if;

  if input_phone is null
     or input_phone !~ '^\+91[0-9]{10}$'
     or input_public_photo_url is null
     or input_public_photo_url !~* (
       '^https://[^/]+/storage/v1/object/public/host-photos/'
       || pg_catalog.regexp_replace(input_phone, '[^0-9]', '', 'g')
       || '/[0-9a-f-]{36}\.(jpg|png|webp)$'
     ) then
    raise exception 'Invalid profile photo';
  end if;

  update public.phone_profiles
  set avatar_url = input_public_photo_url,
      updated_at = now()
  where phone = input_phone;
  if not found then
    raise exception 'The member profile was not found';
  end if;

  update public.phone_identities
  set profile = (
        case
          when jsonb_typeof(profile) = 'object' then profile
          else '{}'::jsonb
        end
      ) || jsonb_build_object('photo', input_public_photo_url),
      updated_at = now()
  where phone = input_phone;
  if not found then
    raise exception 'The phone identity was not found';
  end if;

  update public.host_applications
  set application_profile = (
        case
          when jsonb_typeof(application_profile) = 'object' then application_profile
          else '{}'::jsonb
        end
      ) || jsonb_build_object('photo', input_public_photo_url)
  where phone = input_phone
    and status = 'approved';
end;
$$;

revoke all on function public.publish_phone_profile_photo(text, text)
  from public, anon, authenticated;
grant execute on function public.publish_phone_profile_photo(text, text)
  to service_role;

commit;
