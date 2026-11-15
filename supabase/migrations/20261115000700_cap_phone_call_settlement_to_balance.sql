begin;

create or replace function public.settle_phone_call(
  input_session_id uuid,
  input_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.call_sessions;
  caller_wallet public.phone_wallets;
  minutes integer;
  coin_cost_per_minute numeric(12,1);
  host_earnings_per_minute bigint;
  total_charge numeric(12,1);
  prior_charge numeric(12,1);
  charge numeric(12,1);
  total_host_earnings bigint;
  prior_billed_minutes integer;
  host_earnings bigint;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and caller_phone = input_phone
    and status in ('ended', 'missed', 'rejected', 'cancelled')
  for update;
  if not found then
    raise exception 'Call cannot be settled';
  end if;

  if exists (
    select 1 from public.phone_wallet_ledger
    where phone = call_row.caller_phone and call_session_id = input_session_id
  ) then
    return jsonb_build_object(
      'coins_charged', 0, 'host_earnings_paise', 0,
      'duration_seconds', call_row.duration_seconds, 'already_settled', true
    );
  end if;

  minutes := case when call_row.duration_seconds > 0
    then ceil(call_row.duration_seconds::numeric / 60)::integer else 0 end;
  coin_cost_per_minute := case call_row.call_type when 'video' then 40.0 else 20.0 end;
  host_earnings_per_minute := case call_row.call_type when 'video' then 1000 else 500 end;
  total_charge := minutes * coin_cost_per_minute;
  total_host_earnings := minutes * host_earnings_per_minute;

  select coalesce(sum(-coin_delta), 0.0), count(*)
  into prior_charge, prior_billed_minutes
  from public.phone_call_minute_ledger
  where phone = call_row.caller_phone and call_session_id = input_session_id;
  charge := greatest(0.0, total_charge - prior_charge);
  host_earnings := greatest(0, total_host_earnings - prior_billed_minutes * host_earnings_per_minute);

  insert into public.phone_wallets(phone)
  values (call_row.caller_phone), (call_row.host_phone)
  on conflict (phone) do nothing;
  select * into caller_wallet from public.phone_wallets
  where phone = call_row.caller_phone for update;

  charge := least(charge, greatest(0.0, caller_wallet.coins));
  host_earnings := least(
    host_earnings,
    floor(charge * host_earnings_per_minute / coin_cost_per_minute)::bigint
  );

  if charge > 0 then
    update public.phone_wallets
    set coins = coins - charge, updated_at = now()
    where phone = call_row.caller_phone;
    update public.phone_wallets
    set earnings_paise = earnings_paise + host_earnings, updated_at = now()
    where phone = call_row.host_phone;
  end if;

  insert into public.phone_wallet_ledger(phone, call_session_id, coin_delta)
  values (call_row.caller_phone, input_session_id, -charge);
  insert into public.phone_wallet_ledger(phone, call_session_id, earnings_delta_paise)
  values (call_row.host_phone, input_session_id, host_earnings);

  return jsonb_build_object(
    'coins_charged', charge, 'host_earnings_paise', host_earnings,
    'duration_seconds', call_row.duration_seconds,
    'coins_per_minute', coin_cost_per_minute
  );
end;
$$;

revoke all on function public.settle_phone_call(uuid, text) from public, anon, authenticated;
grant execute on function public.settle_phone_call(uuid, text) to anon, authenticated;

commit;
