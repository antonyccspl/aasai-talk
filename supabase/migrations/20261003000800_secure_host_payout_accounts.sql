begin;

-- Payout details are private financial data. Only trusted server code and an
-- administrator handling a verified payout may read them; they are never
-- exposed through the public data API.
create table if not exists public.phone_host_payout_accounts (
  host_phone text primary key references public.phone_identities(phone) on delete cascade,
  account_holder_name text not null check (length(trim(account_holder_name)) between 2 and 120),
  account_number text not null check (account_number ~ '^[0-9]{9,18}$'),
  ifsc_code text not null check (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  status text not null default 'pending_verification' check (status in ('pending_verification','verified','rejected')),
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.phone_host_withdrawals (
  id uuid primary key default gen_random_uuid(),
  host_phone text not null references public.phone_identities(phone),
  amount_paise bigint not null check (amount_paise >= 10000),
  account_snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','rejected','failed')),
  payout_reference text unique,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists phone_host_withdrawals_host_created_idx
  on public.phone_host_withdrawals(host_phone, created_at desc);

alter table public.phone_host_payout_accounts enable row level security;
alter table public.phone_host_withdrawals enable row level security;
revoke all on public.phone_host_payout_accounts from public, anon, authenticated;
revoke all on public.phone_host_withdrawals from public, anon, authenticated;
grant all on public.phone_host_payout_accounts to service_role;
grant all on public.phone_host_withdrawals to service_role;

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
    raise exception 'A verified bank account is required before withdrawal' using errcode = '42501';
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
    jsonb_build_object(
      'account_holder_name', payout_row.account_holder_name,
      'account_number_last4', right(payout_row.account_number, 4),
      'ifsc_code', payout_row.ifsc_code
    )
  ) returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.request_phone_host_withdrawal(text, bigint) from public, anon, authenticated;
grant execute on function public.request_phone_host_withdrawal(text, bigint) to service_role;

commit;
