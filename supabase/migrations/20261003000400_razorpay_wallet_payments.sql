begin;

-- Razorpay orders are private server-side records. The app can request an
-- order, but it can never choose an amount or credit a wallet itself.
create table if not exists public.phone_payment_orders (
  id uuid primary key default gen_random_uuid(),
  phone text not null references public.phone_identities(phone) on delete cascade,
  coin_pack_id uuid not null references public.coin_packs(id),
  coins bigint not null check (coins > 0),
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  provider_order_id text not null unique,
  provider_payment_id text unique,
  checkout_token_hash text not null unique,
  status text not null default 'created' check (status in ('created', 'authorized', 'captured', 'failed', 'expired', 'refunded')),
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  captured_at timestamptz,
  credited_at timestamptz
);

create index if not exists phone_payment_orders_phone_created_idx
  on public.phone_payment_orders(phone, created_at desc);
create index if not exists phone_payment_orders_provider_payment_idx
  on public.phone_payment_orders(provider_payment_id)
  where provider_payment_id is not null;

alter table public.phone_payment_orders enable row level security;
revoke all on public.phone_payment_orders from public, anon, authenticated;
grant all on public.phone_payment_orders to service_role;

-- The previous development helper allowed a client to credit its own wallet.
-- Keep its historical rows, but remove the client execution permission before
-- real payment testing starts.
revoke all on function public.recharge_phone_wallet(text, bigint, text)
  from public, anon, authenticated;

alter table public.phone_wallet_recharge_ledger
  drop constraint if exists phone_wallet_recharge_ledger_source_check;
alter table public.phone_wallet_recharge_ledger
  add constraint phone_wallet_recharge_ledger_source_check
  check (source in ('test', 'razorpay'));

create or replace function public.credit_phone_wallet_payment(input_payment_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.phone_payment_orders;
  wallet public.phone_wallets;
begin
  select * into payment_order
  from public.phone_payment_orders
  where id = input_payment_order_id
  for update;

  if not found then
    raise exception 'Payment order not found';
  end if;
  if payment_order.status <> 'captured' then
    raise exception 'Payment has not been captured';
  end if;

  insert into public.phone_wallets(phone) values (payment_order.phone)
  on conflict (phone) do nothing;
  select * into wallet from public.phone_wallets
  where phone = payment_order.phone for update;

  if payment_order.credited_at is not null then
    return jsonb_build_object(
      'credited', false,
      'already_credited', true,
      'coins_credited', payment_order.coins,
      'remaining_coins', wallet.coins
    );
  end if;

  update public.phone_wallets
  set coins = coins + payment_order.coins, updated_at = now()
  where phone = payment_order.phone
  returning * into wallet;

  insert into public.phone_wallet_recharge_ledger(phone, client_order_id, coin_delta, source)
  values (payment_order.phone, 'razorpay_' || payment_order.id::text, payment_order.coins, 'razorpay');

  update public.phone_payment_orders
  set credited_at = now(), updated_at = now()
  where id = payment_order.id;

  return jsonb_build_object(
    'credited', true,
    'already_credited', false,
    'coins_credited', payment_order.coins,
    'remaining_coins', wallet.coins
  );
end;
$$;

revoke all on function public.credit_phone_wallet_payment(uuid)
  from public, anon, authenticated;
grant execute on function public.credit_phone_wallet_payment(uuid) to service_role;

-- Keep wallet history readable through the existing narrow RPC while giving
-- verified purchases a friendly, non-technical label.
create or replace function public.get_phone_wallet_activity(
  input_phone text,
  input_limit integer default 50
)
returns table(
  id uuid,
  title text,
  coin_delta bigint,
  category text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select activity.id, activity.title, activity.coin_delta, activity.category,
    activity.status, activity.created_at
  from (
    select recharge.id,
      case when recharge.source = 'razorpay' then 'Coin purchase' else 'Coin recharge' end::text as title,
      recharge.coin_delta,
      'Recharges'::text as category,
      'Completed'::text as status,
      recharge.created_at
    from public.phone_wallet_recharge_ledger recharge
    where recharge.phone = input_phone

    union all

    select minute_charge.id,
      case session.call_type when 'video' then 'Video call' else 'Audio call' end as title,
      minute_charge.coin_delta, 'Calls'::text as category,
      case session.status when 'connected' then 'In progress' when 'ended' then 'Completed' when 'missed' then 'Missed' when 'rejected' then 'Declined' when 'cancelled' then 'Cancelled' else 'Completed' end as status,
      minute_charge.created_at
    from public.phone_call_minute_ledger minute_charge
    join public.call_sessions session on session.id = minute_charge.call_session_id
    where minute_charge.phone = input_phone

    union all

    select settlement.id,
      case session.call_type when 'video' then 'Video call' else 'Audio call' end as title,
      settlement.coin_delta, 'Calls'::text as category,
      case session.status when 'connected' then 'In progress' when 'ended' then 'Completed' when 'missed' then 'Missed' when 'rejected' then 'Declined' when 'cancelled' then 'Cancelled' else 'Completed' end as status,
      settlement.created_at
    from public.phone_wallet_ledger settlement
    join public.call_sessions session on session.id = settlement.call_session_id
    where settlement.phone = input_phone and settlement.coin_delta <> 0
  ) activity
  order by activity.created_at desc, activity.id desc
  limit least(greatest(coalesce(input_limit, 50), 1), 100);
$$;

revoke all on function public.get_phone_wallet_activity(text, integer)
  from public, anon, authenticated;
grant execute on function public.get_phone_wallet_activity(text, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
