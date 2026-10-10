-- Repair wallets created while phone_wallets incorrectly granted 1,250 starter
-- coins.  A wallet is changed only when every persisted credit/debit ledger
-- reconciles to its balance plus exactly that obsolete starter amount.
-- This keeps valid purchases, bonus coins, and spending intact.
begin;

with expected_balances as (
  select
    wallet.phone,
    coalesce(recharges.coins, 0)
      + coalesce(call_settlements.coins, 0)
      + coalesce(minute_charges.coins, 0)
      + coalesce(mode_switches.coins, 0)
      + coalesce(message_charges.coins, 0) as audited_coins
  from public.phone_wallets as wallet
  left join lateral (
    select sum(coin_delta) as coins
    from public.phone_wallet_recharge_ledger
    where phone = wallet.phone
  ) as recharges on true
  left join lateral (
    select sum(coin_delta) as coins
    from public.phone_wallet_ledger
    where phone = wallet.phone
  ) as call_settlements on true
  left join lateral (
    select sum(coin_delta) as coins
    from public.phone_call_minute_ledger
    where phone = wallet.phone
  ) as minute_charges on true
  left join lateral (
    select sum(coin_delta) as coins
    from public.phone_call_mode_switch_ledger
    where phone = wallet.phone
  ) as mode_switches on true
  left join lateral (
    select sum(coin_delta) as coins
    from public.phone_message_wallet_ledger
    where phone = wallet.phone
  ) as message_charges on true
)
update public.phone_wallets as wallet
set
  coins = expected.audited_coins,
  updated_at = now()
from expected_balances as expected
where wallet.phone = expected.phone
  and wallet.coins = expected.audited_coins + 1250;

commit;
