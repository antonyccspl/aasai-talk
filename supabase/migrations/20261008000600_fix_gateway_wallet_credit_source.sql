begin;

-- The earlier payment migration was already applied before the gateway was
-- made provider-neutral. Replace its server-only credit function so a verified
-- Cashfree payment writes the permitted `gateway` ledger source.
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
    values (
      payment_order.phone,
      'gateway_' || payment_order.id::text,
      payment_order.coins,
      'gateway'
    );

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

commit;
