begin;

create or replace function public.submit_phone_host_application(
  input_phone text,
  input_application jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_id uuid;
  photo_review_id text;
  verified_phone text;
  stored_application jsonb;
  photo_review public.phone_content_moderation_items%rowtype;
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$'
     or input_application is null
     or jsonb_typeof(input_application) <> 'object' then
    raise exception 'Invalid host application data';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    verified_phone := pg_catalog.regexp_replace(
      coalesce(auth.jwt() ->> 'phone', ''),
      '[^0-9]',
      '',
      'g'
    );
    if auth.uid() is null or verified_phone !~ '^(91)?[0-9]{10}$'
       or ('+91' || right(verified_phone, 10)) is distinct from input_phone then
      raise exception 'Phone identity must match the verified session';
    end if;
  end if;

  if not exists (
    select 1
    from public.phone_profiles
    where phone = input_phone and gender = 'Female'
  ) then
    raise exception 'Only completed female profiles can apply to become a host';
  end if;

  photo_review_id := input_application ->> 'photo_review_id';
  stored_application := input_application;
  if photo_review_id is not null then
    if photo_review_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid Host photo review reference';
    end if;

    select *
    into photo_review
    from public.phone_content_moderation_items
    where id = photo_review_id::uuid
      and owner_phone = input_phone
      and content_type = 'profile_photo';

    if not found then
      raise exception 'The selected Host photo could not be verified';
    end if;

    if photo_review.status = 'needs_review'
       and photo_review.storage_bucket = 'moderation-media'
       and photo_review.storage_path is not null then
      if input_application ? 'photo' then
        raise exception 'A pending Host photo must remain private';
      end if;
    elsif photo_review.status = 'approved'
       and photo_review.public_url is not null then
      stored_application := (input_application - 'photo_review_id')
        || jsonb_build_object('photo', photo_review.public_url);
    else
      raise exception 'Choose a different Host photo';
    end if;
  elsif coalesce(input_application ->> 'photo', '') !~* '^https?://' then
    raise exception 'Add a valid Host profile photo before submitting';
  end if;

  insert into public.host_applications (
    phone,
    status,
    application_profile,
    submitted_at
  )
  values (
    input_phone,
    'pending',
    stored_application,
    now()
  )
  on conflict (phone) where phone is not null do update set
    status = 'pending',
    application_profile = excluded.application_profile,
    submitted_at = now(),
    reviewed_at = null,
    review_note = null
  returning id into application_id;

  return application_id;
end;
$$;

revoke all on function public.submit_phone_host_application(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_phone_host_application(text, jsonb)
  to anon, authenticated;

create or replace function public.admin_approve_host_application(
  input_application_id uuid,
  input_photo_review_id uuid,
  input_public_photo_url text,
  input_admin_user_id uuid,
  input_review_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.host_applications%rowtype;
  photo_review public.phone_content_moderation_items%rowtype;
  changed_at timestamptz := now();
begin
  if input_application_id is null
     or input_admin_user_id is null
     or (input_photo_review_id is not null
       and coalesce(input_public_photo_url, '') = '') then
    raise exception 'Invalid Host application approval data';
  end if;

  select *
  into application
  from public.host_applications
  where id = input_application_id
  for update;

  if not found or application.phone is null then
    raise exception 'The Host application photo could not be verified';
  end if;

  if input_photo_review_id is not null then
    if application.application_profile ->> 'photo_review_id'
       is distinct from input_photo_review_id::text then
      raise exception 'The Host application photo could not be verified';
    end if;

    select *
    into photo_review
    from public.phone_content_moderation_items
    where id = input_photo_review_id
      and owner_phone = application.phone
      and content_type = 'profile_photo'
    for update;

    if not found then
      raise exception 'The Host photo review item was not found';
    end if;

    if photo_review.status = 'needs_review'
       and photo_review.storage_bucket = 'moderation-media'
       and photo_review.storage_path is not null then
      update public.phone_content_moderation_items
      set status = 'approved',
          public_url = input_public_photo_url,
          decision_note = 'Approved as part of Host application review.',
          reviewed_by = input_admin_user_id,
          reviewed_at = changed_at,
          updated_at = changed_at
      where id = input_photo_review_id;
    elsif photo_review.status <> 'approved'
       or photo_review.public_url is distinct from input_public_photo_url then
      raise exception 'This Host photo is not available for approval';
    end if;
  elsif application.application_profile ? 'photo_review_id' then
    raise exception 'The pending Host photo must be reviewed before approval';
  end if;

  if input_public_photo_url is not null then
    update public.phone_profiles
    set avatar_url = input_public_photo_url,
        updated_at = changed_at
    where phone = application.phone;

    if not found then
      raise exception 'The Host profile was not found';
    end if;
  end if;

  update public.host_applications
  set status = 'approved',
      application_profile = case
        when input_photo_review_id is not null then
          (application.application_profile - 'photo_review_id')
            || jsonb_build_object('photo', input_public_photo_url)
        when input_public_photo_url is not null then
          application.application_profile || jsonb_build_object('photo', input_public_photo_url)
        else application.application_profile
      end,
      reviewed_at = changed_at,
      review_note = input_review_note,
      archived_at = null
  where id = input_application_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, before_state, after_state
  )
  values (
    input_admin_user_id,
    'host_reviewed',
    'host_application',
    input_application_id::text,
    jsonb_build_object('status', application.status),
    jsonb_build_object('status', 'approved', 'photo_review_id', input_photo_review_id)
  );
end;
$$;

revoke all on function public.admin_approve_host_application(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.admin_approve_host_application(
  uuid, uuid, text, uuid, text
) to service_role;

commit;
