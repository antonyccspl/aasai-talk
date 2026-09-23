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
  slab public.receiver_coin_diamond_slabs;
  daily_seconds integer;
  diamonds_per_minute numeric;
  total_diamonds numeric;
  minutes integer;
  total_charge bigint;
  prior_charge bigint;
  charge bigint;
  host_earnings bigint;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and caller_phone = input_phone
    and status in ('ended', 'missed', 'rejected', 'cancelled');
  if not found then raise exception 'Call cannot be settled'; end if;

  if exists (
    select 1 from public.phone_wallet_ledger
    where phone = call_row.caller_phone and call_session_id = input_session_id
  ) then
    return jsonb_build_object('coins_charged', 0, 'diamonds_charged', 0,
      'host_earnings_paise', 0, 'duration_seconds', call_row.duration_seconds,
      'already_settled', true);
  end if;

  select greatest(0, coalesce(sum(l.duration_seconds), 0) - call_row.duration_seconds)::integer
    into daily_seconds
    from public.host_call_time_ledger l
    where l.host_phone = call_row.host_phone and l.call_date = current_date;
  select * into slab from public.receiver_coin_diamond_slabs
  where is_active and call_type = upper(call_row.call_type)
    and daily_seconds >= min_minutes * 60
    and (max_minutes is null or daily_seconds < max_minutes * 60)
  order by min_minutes desc limit 1;
  if not found then raise exception 'No active receiver slab configured'; end if;

  minutes := case when call_row.duration_seconds > 0
    then ceil(call_row.duration_seconds::numeric / 60)::integer else 0 end;
  diamonds_per_minute := slab.diamonds_per_minute;
  total_diamonds := minutes * diamonds_per_minute;
  total_charge := minutes * ceil(diamonds_per_minute * slab.coins_per_diamond)::bigint;
  select coalesce(sum(-coin_delta), 0) into prior_charge
  from public.phone_call_minute_ledger
  where phone = call_row.caller_phone and call_session_id = input_session_id;
  charge := greatest(0, total_charge - prior_charge);
  host_earnings := charge * 100;

  insert into public.phone_wallets(phone)
  values (call_row.caller_phone), (call_row.host_phone)
  on conflict (phone) do nothing;
  select * into caller_wallet from public.phone_wallets
  where phone = call_row.caller_phone for update;
  if caller_wallet.coins < charge then raise exception 'Insufficient coins'; end if;

  if charge > 0 then
    update public.phone_wallets
    set coins = phone_wallets.coins - charge, updated_at = now()
    where phone = call_row.caller_phone;
    update public.phone_wallets
    set earnings_paise = earnings_paise + host_earnings, updated_at = now()
    where phone = call_row.host_phone;
  end if;

  insert into public.phone_wallet_ledger(phone, call_session_id, coin_delta)
  values (call_row.caller_phone, input_session_id, -charge);
  insert into public.phone_wallet_ledger(phone, call_session_id, earnings_delta_paise)
  values (call_row.host_phone, input_session_id, host_earnings);

  return jsonb_build_object('coins_charged', charge,
    'diamonds_charged', total_diamonds, 'diamonds_per_minute', diamonds_per_minute,
    'host_earnings_paise', host_earnings, 'duration_seconds', call_row.duration_seconds,
    'daily_seconds', daily_seconds);
end;
$$;

revoke all on function public.settle_phone_call(uuid, text) from public, anon, authenticated;
grant execute on function public.settle_phone_call(uuid, text) to anon, authenticated;

commit;
