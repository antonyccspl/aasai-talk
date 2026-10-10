begin;

-- The previous pattern used two backslashes before +91. PostgreSQL then
-- expected a literal backslash instead of the + in every real phone number.
-- Keep the amount validation and all payout safeguards unchanged.
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
  if coalesce(input_phone, '') !~ '^\+91[0-9]{10}$'
     or coalesce(input_amount_paise, 0) < 10000 then
    raise exception 'Enter a withdrawal amount of at least ₹100.' using errcode = '22023';
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

revoke all on function public.request_phone_host_withdrawal(text, bigint) from public, anon, authenticated;
grant execute on function public.request_phone_host_withdrawal(text, bigint) to service_role;

commit;
