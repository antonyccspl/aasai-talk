-- A Host's available balance is derived from immutable earnings minus money that
-- has been reserved for, or paid through, a withdrawal.  The wallet cache was
-- introduced before the per-minute earnings ledger and can therefore be stale.
begin;

create or replace function public.get_phone_host_dashboard(input_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(input_phone, '') !~ '^\+91[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  return jsonb_build_object(
    'today_calls', (
      select count(*) from public.host_call_time_ledger
      where host_phone = input_phone and call_date = current_date
    ) + (
      select count(*) from public.call_sessions
      where host_phone = input_phone and status = 'connected' and connected_at >= current_date
    ),
    'today_seconds', coalesce((
      select sum(duration_seconds) from public.host_call_time_ledger
      where host_phone = input_phone and call_date = current_date
    ), 0) + coalesce((
      select sum(greatest(0, floor(extract(epoch from now() - connected_at))::integer))
      from public.call_sessions
      where host_phone = input_phone and status = 'connected' and connected_at >= current_date
    ), 0),
    'today_earnings_paise', coalesce((
      select sum(earnings_paise) from public.phone_host_earnings_ledger
      where host_phone = input_phone and created_at >= current_date
    ), 0),
    'total_calls', (
      select count(*) from public.host_call_time_ledger where host_phone = input_phone
    ),
    'total_earnings_paise', coalesce((
      select sum(earnings_paise) from public.phone_host_earnings_ledger
      where host_phone = input_phone
    ), 0),
    'total_withdrawn_paise', coalesce((
      select sum(amount_paise) from public.phone_host_withdrawals
      where host_phone = input_phone and status = 'completed'
    ), 0),
    'available_earnings_paise', greatest(0, coalesce((
      select sum(earnings_paise) from public.phone_host_earnings_ledger
      where host_phone = input_phone
    ), 0) - coalesce((
      select sum(amount_paise) from public.phone_host_withdrawals
      where host_phone = input_phone and status in ('pending', 'in_review', 'processing', 'completed')
    ), 0)),
    'active_calls', (
      select count(*) from public.call_sessions where host_phone = input_phone and status = 'connected'
    ),
    'missed_calls', (
      select count(*) from public.call_sessions where host_phone = input_phone and status in ('missed', 'rejected')
    ),
    'recent_calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'caller_username', coalesce(nullif(caller.username, ''), 'member_' || substr(md5(recent.caller_phone), 1, 8)),
        'call_type', recent.call_type,
        'status', recent.status,
        'duration_seconds', recent.duration_seconds,
        'created_at', recent.created_at
      ) order by recent.created_at desc)
      from (
        select id, caller_phone, call_type, status, duration_seconds, created_at
        from public.call_sessions
        where host_phone = input_phone and status in ('ended', 'missed', 'rejected')
        order by created_at desc
        limit 5
      ) recent
      left join public.phone_profiles caller on caller.phone = recent.caller_phone
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.request_phone_host_withdrawal(input_phone text, input_amount_paise bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare payout_row public.phone_host_payout_accounts; request_id uuid; available_paise bigint;
begin
  if coalesce(input_phone, '') !~ '^\+91[0-9]{10}$' or coalesce(input_amount_paise, 0) < 10000 then raise exception 'Enter a withdrawal amount of at least ₹100.' using errcode = '22023'; end if;
  if not exists (select 1 from public.host_applications where phone = input_phone and status = 'approved') then raise exception 'Only approved Hosts can request withdrawals' using errcode = '42501'; end if;
  select * into payout_row from public.phone_host_payout_accounts where host_phone = input_phone for update;
  if not found or payout_row.status <> 'verified' then raise exception 'A verified payout destination is required before withdrawal' using errcode = '42501'; end if;
  insert into public.phone_wallets(phone) values (input_phone) on conflict (phone) do nothing;
  perform 1 from public.phone_wallets where phone = input_phone for update;
  if exists (select 1 from public.phone_host_withdrawals where host_phone = input_phone and status in ('pending', 'in_review', 'processing')) then raise exception 'A withdrawal is already being processed' using errcode = '23505'; end if;
  select greatest(0, coalesce((select sum(earnings_paise) from public.phone_host_earnings_ledger where host_phone = input_phone), 0) - coalesce((select sum(amount_paise) from public.phone_host_withdrawals where host_phone = input_phone and status in ('pending', 'in_review', 'processing', 'completed')), 0)) into available_paise;
  if available_paise < input_amount_paise then raise exception 'Withdrawal amount exceeds available earnings' using errcode = '22023'; end if;
  insert into public.phone_host_withdrawals(host_phone, amount_paise, account_snapshot, review_due_at)
  values (input_phone, input_amount_paise, case payout_row.payout_method when 'upi' then jsonb_build_object('payout_method','upi','account_holder_name',payout_row.account_holder_name,'upi_id_masked',regexp_replace(payout_row.upi_id, '^(.{2}).*(@.*)$', '\1••••\2')) else jsonb_build_object('payout_method','bank','account_holder_name',payout_row.account_holder_name,'account_number_last4',right(payout_row.account_number,4),'ifsc_code',payout_row.ifsc_code) end, now() + interval '3 days') returning id into request_id;
  update public.phone_wallets set earnings_paise = available_paise - input_amount_paise, updated_at = now() where phone = input_phone;
  return request_id;
end;
$$;

create or replace function public.review_phone_host_withdrawal(input_withdrawal_id uuid, input_status text, input_payout_reference text default null, input_review_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare withdrawal_row public.phone_host_withdrawals; clean_reference text := nullif(trim(input_payout_reference), ''); clean_note text := nullif(trim(input_review_note), ''); available_paise bigint;
begin
  if input_status not in ('in_review', 'completed', 'rejected', 'failed') then raise exception 'Invalid withdrawal status' using errcode = '22023'; end if;
  select * into withdrawal_row from public.phone_host_withdrawals where id = input_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found' using errcode = 'P0002'; end if;
  if withdrawal_row.status in ('completed', 'rejected', 'failed') then raise exception 'Withdrawal has already reached a final state' using errcode = '55000'; end if;
  if withdrawal_row.status = 'pending' and input_status = 'completed' then raise exception 'Mark the request In review before recording a completed payment' using errcode = '22023'; end if;
  if input_status = 'in_review' and clean_note is null then raise exception 'Add an internal review note before starting review' using errcode = '22023'; end if;
  if input_status = 'completed' and (clean_reference is null or clean_note is null) then raise exception 'A payout reference/UTR and reviewer note are required before completion' using errcode = '22023'; end if;
  if input_status in ('rejected', 'failed') and clean_note is null then raise exception 'A reviewer note is required when a payout is not completed' using errcode = '22023'; end if;
  update public.phone_host_withdrawals set status = input_status, review_started_at = case when input_status = 'in_review' then coalesce(review_started_at, now()) else review_started_at end, payout_reference = coalesce(clean_reference, payout_reference), review_note = clean_note, updated_at = now() where id = input_withdrawal_id;
  perform 1 from public.phone_wallets where phone = withdrawal_row.host_phone for update;
  select greatest(0, coalesce((select sum(earnings_paise) from public.phone_host_earnings_ledger where host_phone = withdrawal_row.host_phone), 0) - coalesce((select sum(amount_paise) from public.phone_host_withdrawals where host_phone = withdrawal_row.host_phone and status in ('pending', 'in_review', 'processing', 'completed')), 0)) into available_paise;
  update public.phone_wallets set earnings_paise = available_paise, updated_at = now() where phone = withdrawal_row.host_phone;
end;
$$;

-- Repair caches for existing approved Hosts. The immutable earnings and payout
-- records remain the source of truth; this only restores the legacy cache.
insert into public.phone_wallets(phone)
select phone from public.host_applications where status = 'approved'
on conflict (phone) do nothing;

update public.phone_wallets wallet
set earnings_paise = greatest(0, coalesce((
  select sum(earnings_paise) from public.phone_host_earnings_ledger earnings
  where earnings.host_phone = wallet.phone
), 0) - coalesce((
  select sum(amount_paise) from public.phone_host_withdrawals withdrawals
  where withdrawals.host_phone = wallet.phone and withdrawals.status in ('pending', 'in_review', 'processing', 'completed')
), 0)), updated_at = now()
where exists (select 1 from public.host_applications applications where applications.phone = wallet.phone and applications.status = 'approved');

revoke all on function public.get_phone_host_dashboard(text) from public, anon, authenticated;
grant execute on function public.get_phone_host_dashboard(text) to anon, authenticated;
revoke all on function public.request_phone_host_withdrawal(text, bigint) from public, anon, authenticated;
grant execute on function public.request_phone_host_withdrawal(text, bigint) to service_role;
revoke all on function public.review_phone_host_withdrawal(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.review_phone_host_withdrawal(uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
