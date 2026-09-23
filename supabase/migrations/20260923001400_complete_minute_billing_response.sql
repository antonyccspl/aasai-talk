begin;

create or replace function public.charge_phone_call_minute(
  input_session_id uuid,
  input_phone text,
  input_minute_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.call_sessions;
  wallet public.phone_wallets;
  slab public.receiver_coin_diamond_slabs;
  daily_seconds integer;
  diamonds numeric(10,2);
  coin_cost bigint;
begin
  if input_minute_number < 1 then
    raise exception 'Invalid call minute';
  end if;

  select * into call_row from public.call_sessions
  where id = input_session_id and caller_phone = input_phone;
  select coalesce(w.coins, 0) into wallet from public.phone_wallets w
  where w.phone = input_phone;

  if call_row.id is null then
    return jsonb_build_object('charged', false, 'call_active', false,
      'minute_complete', false, 'remaining_coins', coalesce(wallet.coins, 0));
  end if;

  if call_row.status <> 'connected' or call_row.connected_at is null then
    return jsonb_build_object('charged', false, 'call_active', false,
      'minute_complete', false, 'remaining_coins', coalesce(wallet.coins, 0));
  end if;

  if floor(extract(epoch from now() - call_row.connected_at) / 60)::integer < input_minute_number then
    return jsonb_build_object('charged', false, 'call_active', true,
      'minute_complete', false, 'remaining_coins', coalesce(wallet.coins, 0));
  end if;

  if exists (
    select 1 from public.phone_call_minute_ledger
    where phone = input_phone and call_session_id = input_session_id
      and minute_number = input_minute_number
  ) then
    select diamonds_charged, -coin_delta into diamonds, coin_cost
    from public.phone_call_minute_ledger
    where phone = input_phone and call_session_id = input_session_id
      and minute_number = input_minute_number;
    return jsonb_build_object('charged', true, 'already_charged', true,
      'call_active', true, 'minute_complete', true,
      'remaining_coins', coalesce(wallet.coins, 0),
      'diamonds_charged', diamonds, 'coins_charged', coin_cost);
  end if;

  select greatest(0,
    coalesce(sum(l.duration_seconds), 0)
    + coalesce((
      select sum(greatest(0, floor(extract(epoch from now() - c.connected_at))::integer))
      from public.call_sessions c
      where c.host_phone = call_row.host_phone and c.status = 'connected'
        and c.connected_at >= current_date and c.id <> call_row.id
    ), 0)
  )::integer into daily_seconds
  from public.host_call_time_ledger l
  where l.host_phone = call_row.host_phone and l.call_date = current_date;

  select * into slab from public.receiver_coin_diamond_slabs
  where is_active and call_type = upper(call_row.call_type)
    and daily_seconds >= min_minutes * 60
    and (max_minutes is null or daily_seconds < max_minutes * 60)
  order by min_minutes desc limit 1;
  if not found then raise exception 'No active receiver slab configured'; end if;

  diamonds := slab.diamonds_per_minute;
  coin_cost := ceil(diamonds * slab.coins_per_diamond)::bigint;
  if wallet.coins < coin_cost then
    return jsonb_build_object('charged', false, 'call_active', true,
      'minute_complete', true, 'insufficient_balance', true,
      'diamonds_required', diamonds, 'coins_required', coin_cost,
      'remaining_coins', wallet.coins);
  end if;

  update public.phone_wallets
  set coins = phone_wallets.coins - coin_cost, updated_at = now()
  where phone = input_phone;
  update public.phone_wallets
  set earnings_paise = earnings_paise + coin_cost * 100, updated_at = now()
  where phone = call_row.host_phone;
  insert into public.phone_call_minute_ledger(
    phone, call_session_id, minute_number, diamonds_charged, coin_delta
  )
  values (input_phone, input_session_id, input_minute_number, diamonds, -coin_cost);

  return jsonb_build_object('charged', true, 'already_charged', false,
    'call_active', true, 'minute_complete', true,
    'diamonds_charged', diamonds, 'coins_charged', coin_cost,
    'remaining_coins', wallet.coins - coin_cost);
end;
$$;

revoke all on function public.charge_phone_call_minute(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.charge_phone_call_minute(uuid, text, integer)
  to anon, authenticated;

commit;
