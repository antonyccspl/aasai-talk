begin;

-- Test-only top-ups until Razorpay verification is integrated. A future payment
-- webhook must credit the wallet through a server-only equivalent, never from
-- a mobile payment-success callback.
create table if not exists public.phone_wallet_recharge_ledger (
  id uuid primary key default gen_random_uuid(),
  phone text not null references public.phone_identities(phone) on delete cascade,
  client_order_id text not null check (char_length(client_order_id) between 12 and 120),
  coin_delta bigint not null check (coin_delta > 0),
  source text not null default 'test' check (source = 'test'),
  created_at timestamptz not null default now(),
  unique(phone, client_order_id)
);

alter table public.phone_wallet_recharge_ledger enable row level security;
revoke all on public.phone_wallet_recharge_ledger from public, anon, authenticated;
grant all on public.phone_wallet_recharge_ledger to service_role;

create or replace function public.recharge_phone_wallet(
  input_phone text,
  input_coins bigint,
  input_client_order_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  wallet public.phone_wallets;
  prior public.phone_wallet_recharge_ledger;
begin
  if input_coins < 1 or input_coins > 10000 then
    raise exception 'Invalid recharge amount';
  end if;
  if char_length(input_client_order_id) < 12 or char_length(input_client_order_id) > 120 then
    raise exception 'Invalid recharge reference';
  end if;
  if not exists (
    select 1 from public.coin_packs where active and coins = input_coins
  ) then
    raise exception 'Choose an active coin pack';
  end if;

  insert into public.phone_wallets(phone) values (input_phone)
  on conflict (phone) do nothing;
  select * into wallet from public.phone_wallets where phone = input_phone for update;

  select * into prior from public.phone_wallet_recharge_ledger
  where phone = input_phone and client_order_id = input_client_order_id;
  if found then
    return jsonb_build_object(
      'credited', false,
      'already_credited', true,
      'coins_credited', prior.coin_delta,
      'remaining_coins', wallet.coins
    );
  end if;

  update public.phone_wallets
  set coins = coins + input_coins, updated_at = now()
  where phone = input_phone
  returning * into wallet;
  insert into public.phone_wallet_recharge_ledger(phone, client_order_id, coin_delta)
  values (input_phone, input_client_order_id, input_coins);

  return jsonb_build_object(
    'credited', true,
    'already_credited', false,
    'coins_credited', input_coins,
    'remaining_coins', wallet.coins
  );
end;
$$;

revoke all on function public.recharge_phone_wallet(text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.recharge_phone_wallet(text, bigint, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
