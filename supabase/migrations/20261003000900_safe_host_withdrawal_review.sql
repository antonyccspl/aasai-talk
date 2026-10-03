begin;

-- Reserved earnings are returned exactly once when an administrator rejects or
-- fails a payout. This is intentionally server/admin-only; a Host cannot alter
-- a withdrawal outcome from the app.
create or replace function public.review_phone_host_withdrawal(
  input_withdrawal_id uuid,
  input_status text,
  input_payout_reference text default null,
  input_review_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  withdrawal_row public.phone_host_withdrawals;
begin
  if input_status not in ('processing','completed','rejected','failed') then
    raise exception 'Invalid withdrawal status' using errcode = '22023';
  end if;
  select * into withdrawal_row from public.phone_host_withdrawals
  where id = input_withdrawal_id for update;
  if not found then
    raise exception 'Withdrawal not found' using errcode = 'P0002';
  end if;
  if withdrawal_row.status in ('completed','rejected','failed') then
    raise exception 'Withdrawal has already reached a final state' using errcode = '55000';
  end if;
  if input_status in ('rejected','failed') then
    update public.phone_wallets
    set earnings_paise = earnings_paise + withdrawal_row.amount_paise, updated_at = now()
    where phone = withdrawal_row.host_phone;
  end if;
  update public.phone_host_withdrawals
  set status = input_status,
      payout_reference = coalesce(nullif(trim(input_payout_reference), ''), payout_reference),
      review_note = nullif(trim(input_review_note), ''),
      updated_at = now()
  where id = input_withdrawal_id;
end;
$$;
revoke all on function public.review_phone_host_withdrawal(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.review_phone_host_withdrawal(uuid, text, text, text) to service_role;

commit;
