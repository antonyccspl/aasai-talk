begin;

create or replace function public.admin_assist_host_onboarding(
  input_phone text,
  input_application_profile jsonb,
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
  profile_gender text;
  application_id uuid;
  payout_method text;
  account_holder text;
  account_number text;
  ifsc text;
  upi text;
  changed_at timestamptz := now();
begin
  if coalesce(input_phone, '') !~ '^\+91[0-9]{10}$'
     or input_application_profile is null
     or jsonb_typeof(input_application_profile) <> 'object'
     or coalesce(input_pan_last4, '') !~ '^[A-Z0-9]{4}$'
     or coalesce(input_aadhaar_last4, '') !~ '^[0-9]{4}$'
     or input_admin_user_id is null then
    raise exception 'Invalid assisted Host onboarding data' using errcode = '22023';
  end if;

  select gender into profile_gender
  from public.phone_profiles
  where phone = input_phone
  for update;
  if not found or profile_gender <> 'Female' then
    raise exception 'Only female members can be enrolled as Hosts' using errcode = '42501';
  end if;

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

  insert into public.host_applications (
    phone, status, application_profile, submitted_at, reviewed_at, review_note
  )
  values (
    input_phone,
    case when input_approve then 'approved' else 'pending' end,
    input_application_profile,
    changed_at,
    case when input_approve then changed_at else null end,
    case when input_approve then 'Approved after assisted onboarding.' else null end
  )
  on conflict (phone) where phone is not null do update set
    status = excluded.status,
    application_profile = excluded.application_profile,
    submitted_at = excluded.submitted_at,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note
  returning id into application_id;

  insert into public.phone_host_compliance (
    host_phone, pan_last4, aadhaar_last4, pan_verified, aadhaar_verified,
    verified_by, verified_at, updated_at
  )
  values (
    input_phone, input_pan_last4, input_aadhaar_last4, true, true,
    input_admin_user_id, changed_at, changed_at
  )
  on conflict (host_phone) do update set
    pan_last4 = excluded.pan_last4,
    aadhaar_last4 = excluded.aadhaar_last4,
    pan_verified = true,
    aadhaar_verified = true,
    verified_by = excluded.verified_by,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;

  insert into public.phone_host_payout_accounts (
    host_phone, account_holder_name, payout_method, account_number,
    ifsc_code, upi_id, status, verification_note, verified_at, updated_at
  )
  values (
    input_phone, account_holder, payout_method, account_number,
    ifsc, upi, case when input_payout_verified then 'verified' else 'pending_verification' end,
    null, case when input_payout_verified then changed_at else null end, changed_at
  )
  on conflict (host_phone) do update set
    account_holder_name = excluded.account_holder_name,
    payout_method = excluded.payout_method,
    account_number = excluded.account_number,
    ifsc_code = excluded.ifsc_code,
    upi_id = excluded.upi_id,
    status = excluded.status,
    verification_note = null,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, after_state
  )
  values (
    input_admin_user_id, 'host_assisted_onboarding',
    'host_application', input_phone,
    jsonb_build_object(
      'approved', input_approve,
      'payout_method', payout_method,
      'payout_verified', input_payout_verified,
      'pan_last4', input_pan_last4,
      'aadhaar_last4', input_aadhaar_last4
    )
  );

  return application_id;
end;
$$;

revoke all on function public.admin_assist_host_onboarding(
  text, jsonb, text, text, jsonb, uuid, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.admin_assist_host_onboarding(
  text, jsonb, text, text, jsonb, uuid, boolean, boolean
) to service_role;

commit;
