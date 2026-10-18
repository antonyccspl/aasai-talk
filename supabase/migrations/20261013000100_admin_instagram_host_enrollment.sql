begin;

create or replace function public.admin_create_instagram_host(
  input_phone text,
  input_profile jsonb,
  input_application jsonb,
  input_aadhaar_path text,
  input_pan_path text,
  input_pan_last4 text,
  input_aadhaar_last4 text,
  input_payout jsonb,
  input_admin_user_id uuid,
  input_approve boolean,
  input_payout_verified boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_id uuid;
  payout_method text;
  payout_status text;
  account_holder text;
  account_number text;
  ifsc text;
  upi text;
  approved_at timestamptz := now();
  application_status text := case when input_approve then 'approved' else 'pending' end;
begin
  if coalesce(input_phone, '') !~ '^\+91[0-9]{10}$'
     or input_profile is null or jsonb_typeof(input_profile) <> 'object'
     or input_application is null or jsonb_typeof(input_application) <> 'object'
     or coalesce(input_profile ->> 'gender', '') <> 'Female'
     or coalesce(input_profile ->> 'guidelinesAccepted', 'false') <> 'true'
     or coalesce(input_profile ->> 'adultAgeConfirmed', 'false') <> 'true'
     or coalesce(input_profile ->> 'adminInstagramOnboarding', 'false') <> 'true'
     or coalesce(input_application ->> 'photoSafetyAdminChecked', 'false') <> 'true'
     or char_length(trim(coalesce(input_profile ->> 'name', ''))) not between 2 and 50
     or coalesce(input_profile ->> 'username', '') !~ '^[A-Za-z0-9_]{3,20}$'
     or char_length(trim(coalesce(input_profile ->> 'city', ''))) not between 2 and 80
     or char_length(trim(coalesce(input_profile ->> 'bio', ''))) not between 12 and 500
     or coalesce(input_profile ->> 'dob', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(input_application ->> 'source', '') <> 'instagram'
     or coalesce(input_aadhaar_path, '') = ''
     or coalesce(input_pan_path, '') = ''
     or coalesce(input_pan_last4, '') !~ '^[A-Z0-9]{4}$'
     or coalesce(input_aadhaar_last4, '') !~ '^[0-9]{4}$'
     or input_admin_user_id is null then
    raise exception 'Invalid Instagram Host enrollment data' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(input_profile -> 'languages'), '') <> 'array'
     or coalesce(jsonb_typeof(input_profile -> 'interests'), '') <> 'array' then
    raise exception 'Select Host languages and interests first' using errcode = '22023';
  end if;
  if jsonb_array_length(input_profile -> 'languages') not between 1 and 4
     or jsonb_array_length(input_profile -> 'interests') not between 1 and 6
     or coalesce(input_profile ->> 'photo', '') !~ '^https?://'
     or coalesce(input_application ->> 'photo', '') !~ '^https?://'
     or (input_profile ->> 'photo') <> (input_application ->> 'photo')
     or (coalesce(input_application ->> 'audio', 'false') <> 'true'
         and coalesce(input_application ->> 'video', 'false') <> 'true') then
    raise exception 'Complete the Host profile, photo, and call preferences first' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(lower(input_profile ->> 'username'), 0)
  );
  payout_method := input_payout ->> 'payout_method';
  account_holder := nullif(trim(input_payout ->> 'account_holder_name'), '');
  account_number := nullif(input_payout ->> 'account_number', '');
  ifsc := nullif(input_payout ->> 'ifsc_code', '');
  upi := nullif(input_payout ->> 'upi_id', '');
  if account_holder is null or char_length(account_holder) not between 2 and 120 then
    raise exception 'Invalid payout account holder name' using errcode = '22023';
  end if;
  if (payout_method = 'upi' and (
        upi is null or upi !~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9._-]{1,64}$'
        or account_number is not null or ifsc is not null
      )) or (payout_method = 'bank' and (
        account_number is null or account_number !~ '^[0-9]{9,18}$'
        or ifsc is null or ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$'
        or upi is not null
      )) or coalesce(payout_method, '') not in ('upi', 'bank') then
    raise exception 'Enter a valid UPI ID or bank destination' using errcode = '22023';
  end if;

  if exists (select 1 from public.phone_profiles where phone = input_phone)
     or exists (select 1 from public.host_applications where phone = input_phone) then
    raise exception 'This phone number already has an app profile or Host application' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.phone_profiles
    where lower(username) = lower(input_profile ->> 'username')
  ) then
    raise exception 'That username is already in use' using errcode = '23505';
  end if;

  insert into public.phone_identities (phone, profile, profile_complete, updated_at)
  values (input_phone, input_profile, true, now())
  on conflict (phone) do update
    set profile = excluded.profile, profile_complete = true, updated_at = now()
    where public.phone_identities.profile_complete = false;
  if not found then
    raise exception 'This phone number already belongs to a completed app profile' using errcode = '23505';
  end if;

  insert into public.phone_profiles (
    phone, display_name, username, bio, gender, date_of_birth, city,
    languages, interests, avatar_url, community_guidelines_accepted_at,
    adult_age_confirmed_at, updated_at
  )
  values (
    input_phone, input_profile ->> 'name', input_profile ->> 'username',
    input_profile ->> 'bio', 'Female', (input_profile ->> 'dob')::date,
    input_profile ->> 'city',
    array(select jsonb_array_elements_text(input_profile -> 'languages')),
    array(select jsonb_array_elements_text(input_profile -> 'interests')),
    input_profile ->> 'photo', approved_at, approved_at, approved_at
  );

  insert into public.host_applications (
    phone, status, application_profile, aadhaar_path, pan_path,
    submitted_at, reviewed_at, review_note
  )
  values (
    input_phone, application_status,
    input_application || jsonb_build_object(
      'audioRate', '2',
      'videoRate', '5',
      'aadhaarDocument', 'Verified by admin',
      'panDocument', 'Verified by admin',
      'onboardedByAdminId', input_admin_user_id
    ),
    input_aadhaar_path, input_pan_path, approved_at,
    case when input_approve then approved_at else null end,
    case when input_approve then 'Approved after Instagram onboarding and admin identity/consent attestation.' else null end
  )
  returning id into application_id;

  insert into public.phone_host_compliance (
    host_phone, pan_last4, aadhaar_last4, pan_verified, aadhaar_verified,
    verified_by, verified_at, updated_at
  )
  values (
    input_phone, input_pan_last4, input_aadhaar_last4, true, true,
    input_admin_user_id, approved_at, approved_at
  );

  payout_status := case when input_payout_verified then 'verified' else 'pending_verification' end;
  insert into public.phone_host_payout_accounts (
    host_phone, account_holder_name, payout_method, account_number,
    ifsc_code, upi_id, status, verified_at, updated_at
  )
  values (
    input_phone, account_holder, payout_method, account_number,
    ifsc, upi, payout_status,
    case when input_payout_verified then approved_at else null end,
    approved_at
  );

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, after_state
  )
  values (
    input_admin_user_id, 'host_instagram_onboarding',
    'host_application', input_phone,
    jsonb_build_object(
      'approved', input_approve,
      'source', 'instagram',
      'phone_verified_by_admin', true,
      'woman_consented', true,
      'adult_identity_documents_checked', true,
      'profile_photo_safety_checked', true,
      'payout_method', payout_method,
      'payout_verified', input_payout_verified,
      'pan_last4', input_pan_last4,
      'aadhaar_last4', input_aadhaar_last4
    )
  );

  return application_id;
end;
$$;

revoke all on function public.admin_create_instagram_host(
  text, jsonb, jsonb, text, text, text, text, jsonb, uuid, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.admin_create_instagram_host(
  text, jsonb, jsonb, text, text, text, text, jsonb, uuid, boolean, boolean
) to service_role;

commit;
