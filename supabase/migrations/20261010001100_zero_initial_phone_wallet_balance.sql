-- Wallets must begin empty.  Coin balances are earned or purchased explicitly;
-- a non-zero schema default made a first 300-coin purchase appear as 1,550 coins.
begin;

alter table public.phone_wallets
  alter column coins set default 0;

-- Repair the known test account only when the full audit trail proves this was
-- its single captured Rs.100 / 300-coin purchase and it has not spent coins.
-- Payment and ledger records are intentionally retained for reconciliation.
update public.phone_wallets as wallet
set
  coins = 300,
  updated_at = now()
where wallet.phone = '+911234567890'
  and wallet.coins = 1550
  and (
    select count(*)
    from public.phone_payment_orders as payment
    where payment.phone = wallet.phone
      and payment.status = 'captured'
  ) = 1
  and exists (
    select 1
    from public.phone_payment_orders as payment
    where payment.phone = wallet.phone
      and payment.status = 'captured'
      and payment.coins = 300
      and payment.amount_paise = 10000
      and payment.credited_at is not null
  )
  and not exists (
    select 1
    from public.phone_wallet_ledger as debit
    where debit.phone = wallet.phone
      and debit.coin_delta < 0
  )
  and not exists (
    select 1
    from public.phone_call_minute_ledger as debit
    where debit.phone = wallet.phone
      and debit.coin_delta < 0
  )
  and not exists (
    select 1
    from public.phone_call_mode_switch_ledger as debit
    where debit.phone = wallet.phone
      and debit.coin_delta < 0
  )
  and not exists (
    select 1
    from public.phone_message_wallet_ledger as debit
    where debit.phone = wallet.phone
      and debit.coin_delta < 0
  );

commit;
