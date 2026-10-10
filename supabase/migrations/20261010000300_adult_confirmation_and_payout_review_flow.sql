begin;

-- Keep an auditable adult confirmation for every newly completed phone profile.
alter table public.phone_profiles
  add column if not exists adult_age_confirmed_at timestamptz;

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
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$'
     or input_profile is null or jsonb_typeof(input_profile) <> 'object'
     or profile_gender not in ('Male', 'Female') or profile_dob is null
     or profile_dob !~ '^\d{4}-\d{2}-\d{2}$'
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

  select profile_complete into was_complete from public.phone_identities where phone = input_phone;
  if not found then raise exception 'Phone identity does not exist'; end if;

  if not coalesce(was_complete, false) and (
    profile_photo is null or char_length(profile_bio) < 12
    or coalesce(input_profile ->> 'guidelinesAccepted', 'false') <> 'true'
    or coalesce(input_profile ->> 'adultAgeConfirmed', 'false') <> 'true'
  ) then
    raise exception 'Confirm that you are 18 or older and accept the community guidelines before continuing';
  end if;

  update public.phone_identities
  set profile = input_profile || jsonb_build_object('guidelinesAccepted', true, 'adultAgeConfirmed', true), profile_complete = true, updated_at = now()
  where phone = input_phone;

  insert into public.phone_profiles
    (phone, display_name, username, bio, gender, date_of_birth, city, languages, interests, avatar_url, community_guidelines_accepted_at, adult_age_confirmed_at)
  values
    (input_phone, profile_name, profile_username, profile_bio, profile_gender, profile_dob::date, profile_city,
     array(select jsonb_array_elements_text(input_profile -> 'languages')),
     array(select jsonb_array_elements_text(input_profile -> 'interests')),
     profile_photo, now(), now())
  on conflict (phone) do update set
    display_name = excluded.display_name, username = excluded.username, bio = excluded.bio,
    gender = excluded.gender, date_of_birth = excluded.date_of_birth, city = excluded.city,
    languages = excluded.languages, interests = excluded.interests,
    avatar_url = coalesce(excluded.avatar_url, public.phone_profiles.avatar_url),
    community_guidelines_accepted_at = coalesce(public.phone_profiles.community_guidelines_accepted_at, excluded.community_guidelines_accepted_at),
    adult_age_confirmed_at = coalesce(public.phone_profiles.adult_age_confirmed_at, excluded.adult_age_confirmed_at),
    updated_at = now();
end;
$$;

alter table public.phone_host_withdrawals
  add column if not exists review_started_at timestamptz,
  add column if not exists review_due_at timestamptz;

update public.phone_host_withdrawals
set review_due_at = coalesce(review_due_at, created_at + interval '3 days')
where review_due_at is null;

alter table public.phone_host_withdrawals
  alter column review_due_at set default (now() + interval '3 days');

alter table public.phone_host_withdrawals
  drop constraint if exists phone_host_withdrawals_status_check;
alter table public.phone_host_withdrawals
  add constraint phone_host_withdrawals_status_check
  check (status in ('pending', 'in_review', 'processing', 'completed', 'rejected', 'failed'));

create or replace function public.request_phone_host_withdrawal(input_phone text, input_amount_paise bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare wallet_row public.phone_wallets; payout_row public.phone_host_payout_accounts; request_id uuid;
begin
  if coalesce(input_phone, '') !~ '^\+91[0-9]{10}$' or coalesce(input_amount_paise, 0) < 10000 then raise exception 'Enter a withdrawal amount of at least ₹100.' using errcode = '22023'; end if;
  if not exists (select 1 from public.host_applications where phone = input_phone and status = 'approved') then raise exception 'Only approved Hosts can request withdrawals' using errcode = '42501'; end if;
  select * into payout_row from public.phone_host_payout_accounts where host_phone = input_phone for update;
  if not found or payout_row.status <> 'verified' then raise exception 'A verified payout destination is required before withdrawal' using errcode = '42501'; end if;
  if exists (select 1 from public.phone_host_withdrawals where host_phone = input_phone and status in ('pending', 'in_review', 'processing')) then raise exception 'A withdrawal is already being processed' using errcode = '23505'; end if;
  select * into wallet_row from public.phone_wallets where phone = input_phone for update;
  if not found or wallet_row.earnings_paise < input_amount_paise then raise exception 'Withdrawal amount exceeds available earnings' using errcode = '22023'; end if;
  update public.phone_wallets set earnings_paise = earnings_paise - input_amount_paise, updated_at = now() where phone = input_phone;
  insert into public.phone_host_withdrawals(host_phone, amount_paise, account_snapshot, review_due_at)
  values (input_phone, input_amount_paise, case payout_row.payout_method when 'upi' then jsonb_build_object('payout_method','upi','account_holder_name',payout_row.account_holder_name,'upi_id_masked',regexp_replace(payout_row.upi_id, '^(.{2}).*(@.*)$', '\1••••\2')) else jsonb_build_object('payout_method','bank','account_holder_name',payout_row.account_holder_name,'account_number_last4',right(payout_row.account_number,4),'ifsc_code',payout_row.ifsc_code) end, now() + interval '3 days') returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.review_phone_host_withdrawal(input_withdrawal_id uuid, input_status text, input_payout_reference text default null, input_review_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare withdrawal_row public.phone_host_withdrawals; clean_reference text := nullif(trim(input_payout_reference), ''); clean_note text := nullif(trim(input_review_note), '');
begin
  if input_status not in ('in_review', 'completed', 'rejected', 'failed') then raise exception 'Invalid withdrawal status' using errcode = '22023'; end if;
  select * into withdrawal_row from public.phone_host_withdrawals where id = input_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found' using errcode = 'P0002'; end if;
  if withdrawal_row.status in ('completed', 'rejected', 'failed') then raise exception 'Withdrawal has already reached a final state' using errcode = '55000'; end if;
  if withdrawal_row.status = 'pending' and input_status = 'completed' then raise exception 'Mark the request In review before recording a completed payment' using errcode = '22023'; end if;
  if input_status = 'in_review' and clean_note is null then raise exception 'Add an internal review note before starting review' using errcode = '22023'; end if;
  if input_status = 'completed' and (clean_reference is null or clean_note is null) then raise exception 'A payout reference/UTR and reviewer note are required before completion' using errcode = '22023'; end if;
  if input_status in ('rejected', 'failed') and clean_note is null then raise exception 'A reviewer note is required when a payout is not completed' using errcode = '22023'; end if;
  if input_status in ('rejected', 'failed') then update public.phone_wallets set earnings_paise = earnings_paise + withdrawal_row.amount_paise, updated_at = now() where phone = withdrawal_row.host_phone; end if;
  update public.phone_host_withdrawals set status = input_status, review_started_at = case when input_status = 'in_review' then coalesce(review_started_at, now()) else review_started_at end, payout_reference = coalesce(clean_reference, payout_reference), review_note = clean_note, updated_at = now() where id = input_withdrawal_id;
end;
$$;

revoke all on function public.request_phone_host_withdrawal(text, bigint) from public, anon, authenticated;
grant execute on function public.request_phone_host_withdrawal(text, bigint) to service_role;
revoke all on function public.review_phone_host_withdrawal(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.review_phone_host_withdrawal(uuid, text, text, text) to service_role;

commit;
