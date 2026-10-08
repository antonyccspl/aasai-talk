begin;

-- Preserve wallet balances and provider-neutral order records while removing
-- legacy gateway labels and provider payloads from the active database.
alter table public.phone_wallet_recharge_ledger
  drop constraint if exists phone_wallet_recharge_ledger_source_check;
update public.phone_wallet_recharge_ledger
  set source = 'gateway', client_order_id = 'gateway_' || id::text
  where source <> 'test';
alter table public.phone_wallet_recharge_ledger
  add constraint phone_wallet_recharge_ledger_source_check
  check (source in ('test', 'gateway'));

update public.phone_payment_orders set provider_payload = null;

update public.transactions
  set title = 'Wallet recharge'
  where kind = 'Recharges';

update public.app_policies_and_settings
  set content = jsonb_set(
    content,
    '{0,description}',
    to_jsonb('We only collect basic account data: your chosen display name, username, city, languages, interests, and profile photo. For wallet transactions, payment order references are securely retained for accounting.'::text)
  )
  where key = 'privacy';

update public.app_policies_and_settings
  set content = jsonb_set(
    jsonb_set(
      content,
      '{0,description}',
      to_jsonb('Wallet coin purchases are credited only after the payment gateway confirms the transaction. Please verify your selected pack before payment.'::text)
    ),
    '{3,description}',
    to_jsonb('For billing queries or disputed charges, contact our finance support desk with your payment reference.'::text)
  )
  where key = 'refund';

notify pgrst, 'reload schema';
commit;
