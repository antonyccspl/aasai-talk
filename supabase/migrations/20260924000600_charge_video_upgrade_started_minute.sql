begin;

-- Accepting video immediately prices the current started minute as video. If
-- that minute was already prepaid as audio, only the difference is debited.
-- This keeps the completed audio minutes in the receipt and prevents a free
-- video minute at an exact 01:00/02:00 upgrade boundary.
create or replace function public.accept_phone_call_video_upgrade(
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
  wallet public.phone_wallets;
  slab public.receiver_coin_diamond_slabs;
  existing_ledger public.phone_call_minute_ledger;
  daily_seconds integer;
  current_minute integer;
  video_cost bigint;
  previous_cost bigint := 0;
  additional_cost bigint;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone) for update;
  if not found then raise exception 'Call session not found'; end if;
  if call_row.status <> 'connected' or call_row.call_type <> 'audio'
     or call_row.video_upgrade_requested_by is null then
    raise exception 'There is no pending video upgrade request';
  end if;
  if input_phone = call_row.video_upgrade_requested_by then
    raise exception 'The other participant must accept the video request';
  end if;

  select coalesce(w.coins, 0) into wallet from public.phone_wallets w
  where w.phone = call_row.caller_phone for update;
  select greatest(0, coalesce(sum(l.duration_seconds), 0))::integer into daily_seconds
  from public.host_call_time_ledger l
  where l.host_phone = call_row.host_phone and l.call_date = current_date;
  select * into slab from public.receiver_coin_diamond_slabs
  where is_active and call_type = 'VIDEO'
    and daily_seconds >= min_minutes * 60
    and (max_minutes is null or daily_seconds < max_minutes * 60)
  order by min_minutes desc limit 1;
  if not found then raise exception 'No active video receiver slab configured'; end if;

  video_cost := ceil(slab.diamonds_per_minute * slab.coins_per_diamond)::bigint;
  current_minute := floor(extract(epoch from now() - call_row.connected_at) / 60)::integer + 1;
  select * into existing_ledger from public.phone_call_minute_ledger
  where phone = call_row.caller_phone and call_session_id = input_session_id
    and minute_number = current_minute;
  if found then previous_cost := -existing_ledger.coin_delta; end if;
  additional_cost := greatest(0, video_cost - previous_cost);
  if wallet.coins < additional_cost then
    raise exception 'Insufficient coins for the video call rate';
  end if;

  if additional_cost > 0 then
    update public.phone_wallets set coins = coins - additional_cost, updated_at = now()
    where phone = call_row.caller_phone;
    update public.phone_wallets set earnings_paise = earnings_paise + additional_cost * 100, updated_at = now()
    where phone = call_row.host_phone;
  end if;
  if found then
    update public.phone_call_minute_ledger
    set diamonds_charged = slab.diamonds_per_minute, coin_delta = -video_cost
    where id = existing_ledger.id;
  else
    insert into public.phone_call_minute_ledger(
      phone, call_session_id, minute_number, diamonds_charged, coin_delta
    ) values (
      call_row.caller_phone, input_session_id, current_minute,
      slab.diamonds_per_minute, -video_cost
    );
  end if;

  update public.call_sessions
  set call_type = 'video', video_upgrade_requested_by = null, video_upgrade_requested_at = null
  where id = input_session_id;
  return jsonb_build_object('call_type', 'video', 'coins_per_minute', video_cost,
    'remaining_coins', wallet.coins - additional_cost);
end;
$$;

revoke all on function public.accept_phone_call_video_upgrade(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_phone_call_video_upgrade(uuid, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
