begin;

-- A Host may receive a manual payout to either a verified bank account or a
-- verified UPI ID.  Keep the destination private and snapshot only masked
-- details on each withdrawal request.
alter table public.phone_host_payout_accounts
  add column if not exists payout_method text not null default 'bank',
  add column if not exists upi_id text;

alter table public.phone_host_payout_accounts
  alter column account_number drop not null,
  alter column ifsc_code drop not null;

alter table public.phone_host_payout_accounts
  drop constraint if exists phone_host_payout_accounts_payout_method_check;
alter table public.phone_host_payout_accounts
  add constraint phone_host_payout_accounts_payout_method_check
  check (payout_method in ('bank', 'upi'));

alter table public.phone_host_payout_accounts
  drop constraint if exists phone_host_payout_accounts_destination_check;
alter table public.phone_host_payout_accounts
  add constraint phone_host_payout_accounts_destination_check
  check (
    (payout_method = 'bank'
      and account_number is not null
      and account_number ~ '^[0-9]{9,18}$'
      and ifsc_code is not null
      and ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'
      and upi_id is null)
    or
    (payout_method = 'upi'
      and account_number is null
      and ifsc_code is null
      and upi_id is not null
      and upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9._-]{1,64}$')
  );

create or replace function public.request_phone_host_withdrawal(
  input_phone text,
  input_amount_paise bigint
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  wallet_row public.phone_wallets;
  payout_row public.phone_host_payout_accounts;
  request_id uuid;
begin
  if input_phone !~ '^\\+91[0-9]{10}$' or input_amount_paise < 10000 then
    raise exception 'Invalid withdrawal request' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.host_applications
    where phone = input_phone and status = 'approved'
  ) then
    raise exception 'Only approved Hosts can request withdrawals' using errcode = '42501';
  end if;

  select * into payout_row from public.phone_host_payout_accounts
  where host_phone = input_phone for update;
  if not found or payout_row.status <> 'verified' then
    raise exception 'A verified payout destination is required before withdrawal' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.phone_host_withdrawals
    where host_phone = input_phone and status in ('pending','processing')
  ) then
    raise exception 'A withdrawal is already being processed' using errcode = '23505';
  end if;

  select * into wallet_row from public.phone_wallets
  where phone = input_phone for update;
  if not found or wallet_row.earnings_paise < input_amount_paise then
    raise exception 'Withdrawal amount exceeds available earnings' using errcode = '22023';
  end if;

  update public.phone_wallets
  set earnings_paise = earnings_paise - input_amount_paise, updated_at = now()
  where phone = input_phone;

  insert into public.phone_host_withdrawals(host_phone, amount_paise, account_snapshot)
  values (
    input_phone,
    input_amount_paise,
    case payout_row.payout_method
      when 'upi' then jsonb_build_object(
        'payout_method', 'upi',
        'account_holder_name', payout_row.account_holder_name,
        'upi_id_masked', regexp_replace(payout_row.upi_id, '^(.{2}).*(@.*)$', '\\1••••\\2')
      )
      else jsonb_build_object(
        'payout_method', 'bank',
        'account_holder_name', payout_row.account_holder_name,
        'account_number_last4', right(payout_row.account_number, 4),
        'ifsc_code', payout_row.ifsc_code
      )
    end
  ) returning id into request_id;
  return request_id;
end;
$$;

-- A manual payment must have proof before it can be finalised.  Rejections
-- and failures require a reason and return the reserved earnings exactly once.
create or replace function public.review_phone_host_withdrawal(
  input_withdrawal_id uuid,
  input_status text,
  input_payout_reference text default null,
  input_review_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  withdrawal_row public.phone_host_withdrawals;
  clean_reference text := nullif(trim(input_payout_reference), '');
  clean_note text := nullif(trim(input_review_note), '');
begin
  if input_status not in ('processing','completed','rejected','failed') then
    raise exception 'Invalid withdrawal status' using errcode = '22023';
  end if;
  if input_status = 'completed' and (clean_reference is null or clean_note is null) then
    raise exception 'A payout reference/UTR and reviewer note are required before completion' using errcode = '22023';
  end if;
  if input_status in ('rejected','failed') and clean_note is null then
    raise exception 'A reviewer note is required when a payout is not completed' using errcode = '22023';
  end if;

  select * into withdrawal_row from public.phone_host_withdrawals
  where id = input_withdrawal_id for update;
  if not found then
    raise exception 'Withdrawal not found' using errcode = 'P0002';
  end if;
  if withdrawal_row.status in ('completed','rejected','failed') then
    raise exception 'Withdrawal has already reached a final state' using errcode = '55000';
  end if;
  if input_status in ('rejected','failed') then
    update public.phone_wallets
    set earnings_paise = earnings_paise + withdrawal_row.amount_paise, updated_at = now()
    where phone = withdrawal_row.host_phone;
  end if;
  update public.phone_host_withdrawals
  set status = input_status,
      payout_reference = coalesce(clean_reference, payout_reference),
      review_note = clean_note,
      updated_at = now()
  where id = input_withdrawal_id;
end;
$$;

revoke all on function public.request_phone_host_withdrawal(text, bigint) from public, anon, authenticated;
grant execute on function public.request_phone_host_withdrawal(text, bigint) to service_role;
revoke all on function public.review_phone_host_withdrawal(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.review_phone_host_withdrawal(uuid, text, text, text) to service_role;

commit;
