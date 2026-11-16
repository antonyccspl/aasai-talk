begin;

create or replace function public.get_moderator_profile_photo_queue(
  input_actor_uid uuid
)
returns table (
  id uuid,
  owner_phone text,
  storage_bucket text,
  storage_path text,
  media_type text,
  decision_note text,
  created_at timestamptz,
  display_name text,
  username text,
  gender text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     or not exists (
       select 1
       from public.admin_roles
       where user_id = input_actor_uid
         and active
         and role = 'moderator'
     ) then
    raise exception 'Moderator access is required';
  end if;

  return query
  with latest_photos as (
    select distinct on (item.owner_phone)
      item.*
    from public.phone_content_moderation_items as item
    where item.content_type = 'profile_photo'
    order by item.owner_phone, item.created_at desc, item.id desc
  )
  select
    item.id,
    item.owner_phone,
    item.storage_bucket,
    item.storage_path,
    item.media_type,
    item.decision_note,
    item.created_at,
    profile.display_name,
    profile.username,
    profile.gender
  from latest_photos as item
  join public.phone_profiles as profile on profile.phone = item.owner_phone
  where item.status = 'needs_review'
    and item.storage_bucket = 'moderation-media'
    and item.storage_path is not null
    and not exists (
      select 1
      from public.host_applications as application
      where application.phone = item.owner_phone
        and application.application_profile ->> 'photo_review_id' = item.id::text
    )
  order by item.created_at asc
  limit 100;
end;
$$;

create or replace function public.review_moderator_profile_photo(
  input_item_id uuid,
  input_actor_uid uuid,
  input_decision text,
  input_review_note text,
  input_public_photo_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_item public.phone_content_moderation_items%rowtype;
  latest_item_id uuid;
  v_reviewed_at timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     or not exists (
       select 1
       from public.admin_roles
       where user_id = input_actor_uid
         and active
         and role = 'moderator'
     ) then
    raise exception 'Moderator access is required';
  end if;

  if input_item_id is null
     or input_decision is null
     or input_decision not in ('approved', 'rejected')
     or input_review_note is null
     or length(trim(input_review_note)) not between 1 and 2000
     or (input_decision = 'approved'
       and coalesce(input_public_photo_url, '') !~* '^https://')
     or (input_decision = 'rejected' and input_public_photo_url is not null) then
    raise exception 'Invalid profile photo review decision';
  end if;

  select *
  into photo_item
  from public.phone_content_moderation_items
  where id = input_item_id
  for update;

  if not found
     or photo_item.content_type <> 'profile_photo'
     or photo_item.storage_bucket <> 'moderation-media'
     or photo_item.status <> 'needs_review' then
    raise exception 'This profile photo is no longer awaiting review';
  end if;

  perform 1
  from public.phone_identities
  where phone = photo_item.owner_phone
  for update;

  select item.id
  into latest_item_id
  from public.phone_content_moderation_items as item
  where item.owner_phone = photo_item.owner_phone
    and item.content_type = 'profile_photo'
  order by item.created_at desc, item.id desc
  limit 1;

  if latest_item_id is distinct from photo_item.id then
    raise exception using
      errcode = 'P0001',
      message = 'profile_photo_superseded';
  end if;

  if exists (
    select 1
    from public.host_applications as application
    where application.phone = photo_item.owner_phone
      and application.application_profile ->> 'photo_review_id' = photo_item.id::text
  ) then
    raise exception 'Review this photo with its Host application';
  end if;

  update public.phone_content_moderation_items
  set status = input_decision,
      public_url = input_public_photo_url,
      decision_note = trim(input_review_note),
      reviewed_by = input_actor_uid,
      reviewed_at = v_reviewed_at,
      updated_at = v_reviewed_at
  where id = photo_item.id
    and status = 'needs_review';

  if not found then
    raise exception 'This profile photo was already reviewed';
  end if;

  if input_decision = 'approved' then
    update public.phone_profiles
    set avatar_url = input_public_photo_url,
        updated_at = v_reviewed_at
    where phone = photo_item.owner_phone;

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
        updated_at = v_reviewed_at
    where phone = photo_item.owner_phone;

    update public.host_applications
    set application_profile = (
          case
            when jsonb_typeof(application_profile) = 'object' then application_profile
            else '{}'::jsonb
          end
        ) || jsonb_build_object('photo', input_public_photo_url)
    where phone = photo_item.owner_phone
      and status = 'approved';
  end if;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state
  )
  values (
    input_actor_uid,
    'profile_photo_reviewed',
    'content_moderation_item',
    photo_item.id::text,
    jsonb_build_object('status', photo_item.status),
    jsonb_build_object(
      'status', input_decision,
      'owner_phone', photo_item.owner_phone,
      'note', trim(input_review_note)
    )
  );

  return jsonb_build_object('id', photo_item.id, 'status', input_decision);
end;
$$;

revoke all on function public.get_moderator_profile_photo_queue(uuid)
  from public, anon, authenticated;
revoke all on function public.review_moderator_profile_photo(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.get_moderator_profile_photo_queue(uuid)
  to service_role;
grant execute on function public.review_moderator_profile_photo(
  uuid, uuid, text, text, text
) to service_role;

commit;
