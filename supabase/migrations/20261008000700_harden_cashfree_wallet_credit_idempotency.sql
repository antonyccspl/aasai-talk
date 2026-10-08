begin;

-- Cashfree can deliver a webhook while the customer is also checking the
-- payment status in the app.  Keep both confirmation paths, but make the
-- recharge ledger the immutable, unique credit receipt.  The receipt is
-- written before the wallet changes, inside the same transaction, so a retry
-- can never add coins for the same payment order a second time.
create or replace function public.credit_phone_wallet_payment(input_payment_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.phone_payment_orders;
  wallet public.phone_wallets;
  recharge_id uuid;
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
  select * into wallet
  from public.phone_wallets
  where phone = payment_order.phone
  for update;

  if payment_order.credited_at is not null then
    return jsonb_build_object(
      'credited', false,
      'already_credited', true,
      'coins_credited', payment_order.coins,
      'remaining_coins', wallet.coins
    );
  end if;

  insert into public.phone_wallet_recharge_ledger(
    phone, client_order_id, coin_delta, source
  ) values (
    payment_order.phone,
    'gateway_' || payment_order.id::text,
    payment_order.coins,
    'gateway'
  )
  on conflict (phone, client_order_id) do nothing
  returning id into recharge_id;

  -- A committed receipt means a prior invocation already handled this order.
  -- No wallet mutation is allowed on a duplicate receipt.
  if recharge_id is null then
    update public.phone_payment_orders
      set credited_at = coalesce(credited_at, now()), updated_at = now()
      where id = payment_order.id;
    return jsonb_build_object(
      'credited', false,
      'already_credited', true,
      'coins_credited', payment_order.coins,
      'remaining_coins', wallet.coins
    );
  end if;

  update public.phone_wallets
    set coins = coins + payment_order.coins,
        updated_at = now()
    where phone = payment_order.phone
    returning * into wallet;

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
