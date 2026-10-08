begin;

-- PostgreSQL's regex engine caps a bounded repetition at 255.  The prior
-- `{2,256}` range caused every UPI payout destination save to fail while the
-- database evaluated the destination constraint.
alter table public.phone_host_payout_accounts
  drop constraint if exists phone_host_payout_accounts_destination_check;

alter table public.phone_host_payout_accounts
  add constraint phone_host_payout_accounts_destination_check
  check (
    (payout_method = 'bank'
      and account_number is not null
      and account_number ~ '^[0-9]{9,18}$'
      and ifsc_code is not null
      and ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'
      and upi_id is null)
    or
    (payout_method = 'upi'
      and account_number is null
      and ifsc_code is null
      and upi_id is not null
      and upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9._-]{1,64}$')
  );

commit;
