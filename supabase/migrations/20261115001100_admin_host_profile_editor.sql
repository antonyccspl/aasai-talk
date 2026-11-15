begin;

create table public.admin_host_phone_change_requests (
  host_phone text primary key references public.phone_identities(phone) on delete cascade,
  new_phone text not null check (new_phone ~ '^\+91[0-9]{10}$'),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled', 'expired')),
  completed_at timestamptz
);
create unique index admin_host_phone_change_requests_pending_phone_key
  on public.admin_host_phone_change_requests (new_phone)
  where status = 'pending';

alter table public.admin_host_phone_change_requests enable row level security;
revoke all on public.admin_host_phone_change_requests from public, anon, authenticated;
grant all on public.admin_host_phone_change_requests to service_role;

do $$
declare
  constraint_row record;
  updated_definition text;
begin
  for constraint_row in
    select conrelid::regclass as child_table,
           conname,
           pg_get_constraintdef(oid) as definition
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.phone_identities'::regclass
  loop
    if position('ON UPDATE CASCADE' in upper(constraint_row.definition)) = 0 then
      if constraint_row.definition ~* 'ON UPDATE (NO ACTION|RESTRICT|SET NULL|SET DEFAULT)' then
        updated_definition := regexp_replace(
          constraint_row.definition,
          'ON UPDATE (NO ACTION|RESTRICT|SET NULL|SET DEFAULT)([[:space:]]*[(][^)]*[)])?',
          'ON UPDATE CASCADE',
          'i'
        );
      else
        updated_definition := regexp_replace(
          constraint_row.definition,
          '(REFERENCES (public[.])?phone_identities[(]phone[)])',
          '\1 ON UPDATE CASCADE',
          'i'
        );
      end if;
      if updated_definition = constraint_row.definition then
        raise exception 'Could not add phone identity cascade to constraint %',
          constraint_row.conname;
      end if;
      execute format(
        'alter table %s drop constraint %I',
        constraint_row.child_table,
        constraint_row.conname
      );
      execute format(
        'alter table %s add constraint %I %s',
        constraint_row.child_table,
        constraint_row.conname,
        updated_definition
      );
    end if;
  end loop;
end;
$$;

create or replace function public.sync_verified_host_phone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is not distinct from old.phone then
    return new;
  end if;

  if new.phone is null
     or new.phone !~ '^\+91[0-9]{10}$'
     or new.phone_confirmed_at is null then
    raise exception 'A verified Indian phone number is required';
  end if;

  if not exists (
    select 1
    from public.host_applications host
    where host.phone = old.phone
      and host.status = 'approved'
  ) then
    raise exception 'Only approved Hosts can change their login phone';
  end if;

  if not exists (
    select 1
    from public.admin_host_phone_change_requests request
    where request.host_phone = old.phone
      and request.new_phone = new.phone
      and request.status = 'pending'
      and request.expires_at > now()
    for update
  ) then
    raise exception 'An active admin phone-change request is required';
  end if;

  if exists (
    select 1
    from public.phone_identities identity
    where identity.phone = new.phone
  ) then
    raise exception 'The new phone number is already linked to an account';
  end if;

  if exists (
    select 1
    from public.call_sessions call
    where call.host_phone = old.phone
      and call.status in ('ringing', 'connected')
  ) then
    raise exception 'The Host cannot change their phone number during a call';
  end if;

  update public.phone_identities
  set phone = new.phone,
      updated_at = now()
  where phone = old.phone;
  if not found then
    raise exception 'The Host phone identity could not be transferred';
  end if;
  update public.admin_host_phone_change_requests
  set status = 'completed',
      completed_at = now()
  where new_phone = new.phone
    and status = 'pending';

  return new;
end;
$$;

revoke all on function public.sync_verified_host_phone_change()
  from public, anon, authenticated;
drop trigger if exists sync_verified_host_phone_change on auth.users;
create trigger sync_verified_host_phone_change
  after update of phone on auth.users
  for each row
  when (old.phone is distinct from new.phone)
  execute function public.sync_verified_host_phone_change();

create or replace function public.admin_update_host_details(
  input_phone text,
  input_profile jsonb,
  input_application_profile jsonb,
  input_call_preferences jsonb,
  input_payout jsonb,
  input_compliance jsonb,
  input_new_phone text,
  input_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_row public.phone_profiles%rowtype;
  identity_profile jsonb;
  application_row public.host_applications%rowtype;
  payout_row public.phone_host_payout_accounts%rowtype;
  compliance_row public.phone_host_compliance%rowtype;
  presence_row public.phone_host_presence%rowtype;
  payout_exists boolean;
  compliance_exists boolean;
  presence_exists boolean;
  profile_name text;
  profile_username text;
  profile_dob text;
  profile_city text;
  profile_bio text;
  profile_languages text[];
  profile_interests text[];
  application_data jsonb;
  payout_method text;
  payout_holder text;
  payout_account text;
  payout_ifsc text;
  payout_upi text;
  payout_data_provided boolean;
  payout_changed boolean;
  pan_last4 text;
  aadhaar_last4 text;
  pan_changed boolean;
  aadhaar_changed boolean;
  audio_enabled boolean;
  video_enabled boolean;
  audio_preference boolean;
  video_preference boolean;
  changed_at timestamptz := now();
  phone_change_requested boolean := false;
begin
  if coalesce(input_phone, '') !~ '^\+91[0-9]{10}$'
     or input_admin_user_id is null
     or input_profile is null or jsonb_typeof(input_profile) <> 'object'
     or input_application_profile is null
     or jsonb_typeof(input_application_profile) <> 'object'
     or input_call_preferences is null
     or jsonb_typeof(input_call_preferences) <> 'object'
     or input_payout is null or jsonb_typeof(input_payout) <> 'object'
     or input_compliance is null
     or jsonb_typeof(input_compliance) <> 'object' then
    raise exception 'Invalid Host edit data' using errcode = '22023';
  end if;

  select * into profile_row
  from public.phone_profiles
  where phone = input_phone and gender = 'Female'
  for update;
  if not found then raise exception 'Host profile was not found'; end if;

  select * into application_row
  from public.host_applications
  where phone = input_phone and status = 'approved'
  for update;
  if not found then raise exception 'Only approved Hosts can be edited'; end if;

  select profile into identity_profile
  from public.phone_identities
  where phone = input_phone
  for update;
  if not found then raise exception 'Host phone identity was not found'; end if;

  select * into payout_row
  from public.phone_host_payout_accounts
  where host_phone = input_phone
  for update;
  payout_exists := found;

  select * into compliance_row
  from public.phone_host_compliance
  where host_phone = input_phone
  for update;
  compliance_exists := found;

  select * into presence_row
  from public.phone_host_presence
  where host_phone = input_phone
  for update;
  presence_exists := found;

  profile_name := nullif(trim(input_profile ->> 'display_name'), '');
  profile_username := nullif(trim(input_profile ->> 'username'), '');
  profile_dob := input_profile ->> 'date_of_birth';
  profile_city := trim(coalesce(input_profile ->> 'city', ''));
  profile_bio := trim(coalesce(input_profile ->> 'bio', ''));
  if profile_name is null or char_length(profile_name) not between 2 and 50
     or profile_username is null
     or profile_username !~ '^[A-Za-z0-9_]{3,20}$'
     or profile_dob is null
     or not pg_catalog.pg_input_is_valid(profile_dob, 'date')
     or char_length(profile_city) not between 2 and 80
     or char_length(profile_bio) not between 12 and 500
     or coalesce(input_profile ->> 'avatar_url', '') !~* '^https?://' then
    raise exception 'Invalid Host profile details' using errcode = '22023';
  end if;
  if profile_dob::date > current_date - interval '18 years' then
    raise exception 'A Host must be at least 18 years old' using errcode = '22023';
  end if;
  if jsonb_typeof(input_profile -> 'languages') is distinct from 'array'
     or jsonb_typeof(input_profile -> 'interests') is distinct from 'array'
     or jsonb_array_length(input_profile -> 'languages') not between 1 and 4
     or jsonb_array_length(input_profile -> 'interests') not between 1 and 6
     or exists (
       select 1
       from jsonb_array_elements(input_profile -> 'languages') item(value)
       where jsonb_typeof(value) <> 'string'
     )
     or exists (
       select 1
       from jsonb_array_elements(input_profile -> 'interests') item(value)
       where jsonb_typeof(value) <> 'string'
     )
     or exists (
       select 1
       from jsonb_array_elements_text(input_profile -> 'languages') value
       where length(trim(value)) not between 1 and 40
     )
     or exists (
       select 1
       from jsonb_array_elements_text(input_profile -> 'interests') value
       where length(trim(value)) not between 1 and 40
     ) then
    raise exception 'Choose valid Host languages and interests' using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct value)
    from jsonb_array_elements_text(input_profile -> 'languages') value
  ) or (
    select count(*) <> count(distinct value)
    from jsonb_array_elements_text(input_profile -> 'interests') value
  ) then
    raise exception 'Remove duplicate Host languages and interests'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.phone_profiles
    where lower(username) = lower(profile_username) and phone <> input_phone
  ) then
    raise exception 'That username is already in use' using errcode = '23505';
  end if;

  audio_enabled := coalesce((input_application_profile ->> 'audio')::boolean, false);
  video_enabled := coalesce((input_application_profile ->> 'video')::boolean, false);
  audio_preference := input_call_preferences ->> 'accepting_audio_calls' = 'true';
  video_preference := input_call_preferences ->> 'accepting_video_calls' = 'true';
  if (not audio_enabled and not video_enabled)
     or (audio_preference and not audio_enabled)
     or (video_preference and not video_enabled) then
    raise exception 'Enable a supported call type and keep preferences consistent'
      using errcode = '22023';
  end if;

  payout_method := nullif(input_payout ->> 'payout_method', '');
  payout_holder := nullif(trim(input_payout ->> 'account_holder_name'), '');
  payout_account := nullif(input_payout ->> 'account_number', '');
  payout_ifsc := nullif(input_payout ->> 'ifsc_code', '');
  payout_upi := nullif(input_payout ->> 'upi_id', '');
  payout_data_provided := payout_method is not null
    or payout_holder is not null
    or payout_account is not null
    or payout_ifsc is not null
    or payout_upi is not null;
  if (payout_data_provided and (
       payout_holder is null or char_length(payout_holder) not between 2 and 120
     or (payout_method = 'bank' and (
       payout_account is null or payout_account !~ '^[0-9]{9,18}$'
       or payout_ifsc is null or payout_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$'
       or payout_upi is not null
     ))
     or (payout_method = 'upi' and (
       payout_upi is null
       or payout_upi !~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9._-]{1,64}$'
       or payout_account is not null or payout_ifsc is not null
     ))
     or coalesce(payout_method, '') not in ('bank', 'upi')
     ))
     or (not payout_data_provided and coalesce((input_payout ->> 'payout_verified')::boolean, false)) then
    raise exception 'Enter a valid Host payout destination' using errcode = '22023';
  end if;

  pan_last4 := nullif(upper(input_compliance ->> 'pan_last4'), '');
  aadhaar_last4 := nullif(input_compliance ->> 'aadhaar_last4', '');
  if (pan_last4 is not null and pan_last4 !~ '^[0-9]{3}[A-Z]$')
     or (aadhaar_last4 is not null and aadhaar_last4 !~ '^[0-9]{4}$') then
    raise exception 'Enter valid final four digits for Host identity documents'
      using errcode = '22023';
  end if;

  application_data := input_application_profile || jsonb_build_object(
    'name', profile_name,
    'bio', profile_bio,
    'languages', input_profile -> 'languages',
    'interests', input_profile -> 'interests',
    'audio', audio_enabled,
    'video', video_enabled,
    'photo', input_profile ->> 'avatar_url'
  );
  if (input_profile ->> 'avatar_url') is distinct from profile_row.avatar_url then
    application_data := application_data - 'photo_review_id';
    if (application_row.application_profile ->> 'photo_review_id')
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      update public.phone_content_moderation_items
      set status = 'rejected',
          decision_note = 'Replaced by an administrator-approved Host photo.',
          reviewed_by = input_admin_user_id,
          reviewed_at = changed_at,
          updated_at = changed_at
      where id = (application_row.application_profile ->> 'photo_review_id')::uuid
        and owner_phone = input_phone
        and content_type = 'profile_photo'
        and status = 'needs_review';
    end if;
  end if;
  profile_languages := array(
    select jsonb_array_elements_text(input_profile -> 'languages')
  );
  profile_interests := array(
    select jsonb_array_elements_text(input_profile -> 'interests')
  );

  update public.phone_profiles
  set display_name = profile_name,
      username = profile_username,
      date_of_birth = profile_dob::date,
      city = profile_city,
      bio = profile_bio,
      languages = profile_languages,
      interests = profile_interests,
      avatar_url = input_profile ->> 'avatar_url',
      updated_at = changed_at
  where phone = input_phone;

  update public.phone_identities
  set profile = coalesce(identity_profile, '{}'::jsonb) || jsonb_build_object(
        'name', profile_name,
        'username', profile_username,
        'dob', profile_dob,
        'date_of_birth', profile_dob,
        'city', profile_city,
        'bio', profile_bio,
        'languages', input_profile -> 'languages',
        'interests', input_profile -> 'interests',
        'photo', input_profile ->> 'avatar_url'
      ),
      updated_at = changed_at
  where phone = input_phone;

  update public.host_applications
  set application_profile = application_data,
      aadhaar_path = coalesce(application_data ->> 'aadhaarPath', aadhaar_path),
      pan_path = coalesce(application_data ->> 'panPath', pan_path)
  where id = application_row.id;

  insert into public.phone_host_presence (
    host_phone, last_seen_at, accepting_audio_calls, accepting_video_calls
  ) values (
    input_phone, timestamptz 'epoch', audio_preference, video_preference
  )
  on conflict (host_phone) do update
    set accepting_audio_calls = excluded.accepting_audio_calls,
        accepting_video_calls = excluded.accepting_video_calls;

  payout_changed := payout_data_provided and (
    not payout_exists
    or payout_row.account_holder_name is distinct from payout_holder
    or payout_row.payout_method is distinct from payout_method
    or payout_row.account_number is distinct from payout_account
    or payout_row.ifsc_code is distinct from payout_ifsc
    or payout_row.upi_id is distinct from payout_upi
  );
  if payout_changed or coalesce((input_payout ->> 'payout_verified')::boolean, false) then
    insert into public.phone_host_payout_accounts (
      host_phone, account_holder_name, payout_method, account_number, ifsc_code,
      upi_id, status, verification_note, verified_at, updated_at
    ) values (
      input_phone, payout_holder, payout_method, payout_account, payout_ifsc,
      payout_upi,
      case when coalesce((input_payout ->> 'payout_verified')::boolean, false)
        then 'verified' else 'pending_verification' end,
      case when coalesce((input_payout ->> 'payout_verified')::boolean, false)
        then 'Updated and verified by an administrator' else null end,
      case when coalesce((input_payout ->> 'payout_verified')::boolean, false)
        then changed_at else null end,
      changed_at
    )
    on conflict (host_phone) do update set
      account_holder_name = excluded.account_holder_name,
      payout_method = excluded.payout_method,
      account_number = excluded.account_number,
      ifsc_code = excluded.ifsc_code,
      upi_id = excluded.upi_id,
      status = case
        when coalesce((input_payout ->> 'payout_verified')::boolean, false)
          then 'verified'
        else 'pending_verification'
      end,
      verification_note = excluded.verification_note,
      verified_at = excluded.verified_at,
      updated_at = changed_at;
  end if;

  pan_changed := not compliance_exists
    or pan_last4 is distinct from compliance_row.pan_last4
    or coalesce(input_application_profile ->> 'panPath', application_row.pan_path)
      is distinct from application_row.pan_path
    or coalesce((input_compliance ->> 'pan_verified')::boolean, false)
      is distinct from coalesce(compliance_row.pan_verified, false);
  aadhaar_changed := not compliance_exists
    or aadhaar_last4 is distinct from compliance_row.aadhaar_last4
    or coalesce(input_application_profile ->> 'aadhaarPath', application_row.aadhaar_path)
      is distinct from application_row.aadhaar_path
    or coalesce((input_compliance ->> 'aadhaar_verified')::boolean, false)
      is distinct from coalesce(compliance_row.aadhaar_verified, false);
  if pan_changed or aadhaar_changed
     or not compliance_exists
     or coalesce((input_compliance ->> 'pan_verified')::boolean, false)
     or coalesce((input_compliance ->> 'aadhaar_verified')::boolean, false) then
    insert into public.phone_host_compliance (
      host_phone, pan_last4, aadhaar_last4, pan_verified, aadhaar_verified,
      verified_by, verified_at, updated_at
    ) values (
      input_phone, pan_last4, aadhaar_last4,
      coalesce((input_compliance ->> 'pan_verified')::boolean, false),
      coalesce((input_compliance ->> 'aadhaar_verified')::boolean, false),
      case when coalesce((input_compliance ->> 'pan_verified')::boolean, false)
             or coalesce((input_compliance ->> 'aadhaar_verified')::boolean, false)
        then input_admin_user_id else null end,
      case when coalesce((input_compliance ->> 'pan_verified')::boolean, false)
             or coalesce((input_compliance ->> 'aadhaar_verified')::boolean, false)
        then changed_at else null end,
      changed_at
    )
    on conflict (host_phone) do update set
      pan_last4 = excluded.pan_last4,
      aadhaar_last4 = excluded.aadhaar_last4,
      pan_verified = case when pan_changed
        then coalesce((input_compliance ->> 'pan_verified')::boolean, false)
        else phone_host_compliance.pan_verified end,
      aadhaar_verified = case when aadhaar_changed
        then coalesce((input_compliance ->> 'aadhaar_verified')::boolean, false)
        else phone_host_compliance.aadhaar_verified end,
      verified_by = case when pan_changed or aadhaar_changed
        then case when (
                     case when pan_changed
                       then coalesce((input_compliance ->> 'pan_verified')::boolean, false)
                       else phone_host_compliance.pan_verified end
                   ) or (
                     case when aadhaar_changed
                       then coalesce((input_compliance ->> 'aadhaar_verified')::boolean, false)
                       else phone_host_compliance.aadhaar_verified end
                   )
               then input_admin_user_id else null end
        else phone_host_compliance.verified_by end,
      verified_at = case when pan_changed or aadhaar_changed
        then case when (
                     case when pan_changed
                       then coalesce((input_compliance ->> 'pan_verified')::boolean, false)
                       else phone_host_compliance.pan_verified end
                   ) or (
                     case when aadhaar_changed
                       then coalesce((input_compliance ->> 'aadhaar_verified')::boolean, false)
                       else phone_host_compliance.aadhaar_verified end
                   )
               then changed_at else null end
        else phone_host_compliance.verified_at end,
      updated_at = changed_at;
  end if;

  if input_new_phone is not null and input_new_phone <> input_phone then
    if input_new_phone !~ '^\+91[0-9]{10}$'
       or exists (
         select 1 from public.phone_identities
         where phone = input_new_phone
       )
       or exists (
         select 1 from public.call_sessions
         where host_phone = input_phone
           and status in ('ringing', 'connected')
       ) then
      raise exception 'The new phone is invalid, already registered, or the Host is in a call'
        using errcode = '22023';
    end if;
    update public.admin_host_phone_change_requests
    set status = 'expired'
    where status = 'pending'
      and expires_at <= changed_at;
    insert into public.admin_host_phone_change_requests (
      host_phone, new_phone, requested_by, requested_at, expires_at,
      status, completed_at
    ) values (
      input_phone, input_new_phone, input_admin_user_id, changed_at,
      changed_at + interval '24 hours', 'pending', null
    )
    on conflict (host_phone) do update set
      new_phone = excluded.new_phone,
      requested_by = excluded.requested_by,
      requested_at = excluded.requested_at,
      expires_at = excluded.expires_at,
      status = 'pending',
      completed_at = null;
    phone_change_requested := true;
  end if;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    input_admin_user_id,
    'host_details_updated',
    'host_application',
    input_phone,
    jsonb_build_object(
      'display_name', profile_row.display_name,
      'username', profile_row.username,
      'date_of_birth', profile_row.date_of_birth,
      'city', profile_row.city,
      'bio', profile_row.bio,
      'languages', profile_row.languages,
      'interests', profile_row.interests,
      'avatar_url', profile_row.avatar_url,
      'audio', application_row.application_profile -> 'audio',
      'video', application_row.application_profile -> 'video',
      'accepting_audio_calls', case when presence_exists
        then presence_row.accepting_audio_calls else true end,
      'accepting_video_calls', case when presence_exists
        then presence_row.accepting_video_calls else true end,
      'payout_method', payout_row.payout_method,
      'account_holder_name', payout_row.account_holder_name,
      'account_number_last4', right(payout_row.account_number, 4),
      'ifsc_last4', right(payout_row.ifsc_code, 4),
      'upi_id', case when payout_row.upi_id is null then null
        else regexp_replace(payout_row.upi_id, '^(.{2}).*(@.*)$', '\1••••\2') end,
      'pan_last4', compliance_row.pan_last4,
      'pan_verified', compliance_row.pan_verified,
      'aadhaar_last4', compliance_row.aadhaar_last4,
      'aadhaar_verified', compliance_row.aadhaar_verified
    ),
    jsonb_build_object(
      'display_name', profile_name,
      'username', profile_username,
      'date_of_birth', profile_dob,
      'city', profile_city,
      'bio', profile_bio,
      'languages', input_profile -> 'languages',
      'interests', input_profile -> 'interests',
      'avatar_url', input_profile -> 'avatar_url',
      'audio', audio_enabled,
      'video', video_enabled,
      'accepting_audio_calls', audio_preference,
      'accepting_video_calls', video_preference,
      'payout_method', case when payout_data_provided then payout_method else payout_row.payout_method end,
      'account_holder_name', case when payout_data_provided then payout_holder else payout_row.account_holder_name end,
      'account_number_last4', right(case when payout_data_provided then payout_account else payout_row.account_number end, 4),
      'ifsc_last4', right(case when payout_data_provided then payout_ifsc else payout_row.ifsc_code end, 4),
      'upi_id', case when coalesce(case when payout_data_provided then payout_upi else payout_row.upi_id end, '') = ''
        then null
        else regexp_replace(case when payout_data_provided then payout_upi else payout_row.upi_id end, '^(.{2}).*(@.*)$', '\1••••\2') end,
      'pan_last4', pan_last4,
      'pan_verified', coalesce((input_compliance ->> 'pan_verified')::boolean, false),
      'aadhaar_last4', aadhaar_last4,
      'aadhaar_verified', coalesce((input_compliance ->> 'aadhaar_verified')::boolean, false),
      'phone_change_requested', phone_change_requested
    )
  );

  return jsonb_build_object('ok', true, 'phone_change_requested', phone_change_requested);
end;
$$;

revoke all on function public.admin_update_host_details(
  text, jsonb, jsonb, jsonb, jsonb, jsonb, text, uuid
) from public, anon, authenticated;
grant execute on function public.admin_update_host_details(
  text, jsonb, jsonb, jsonb, jsonb, jsonb, text, uuid
) to service_role;

notify pgrst, 'reload schema';
commit;
