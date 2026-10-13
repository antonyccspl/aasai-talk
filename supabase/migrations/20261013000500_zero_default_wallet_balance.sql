begin;

-- Wallets must not receive starter coins. A male user who has not bought
-- coins must be rejected by send_phone_message before a message is inserted.
-- This changes only the default used for wallets created in the future; it
-- intentionally does not modify any existing wallet balance.
alter table public.phone_wallets
  alter column coins set default 0.0;

commit;
