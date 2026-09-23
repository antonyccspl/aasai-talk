begin;

create table if not exists public.phone_call_mode_switch_ledger (
  id uuid primary key default gen_random_uuid(),
  phone text not null references public.phone_identities(phone),
  call_session_id uuid not null references public.call_sessions(id),
  from_call_type text not null check (from_call_type in ('audio', 'video')),
  to_call_type text not null check (to_call_type in ('audio', 'video')),
  diamonds_charged numeric(10,2) not null check (diamonds_charged > 0),
  coin_delta bigint not null check (coin_delta < 0),
  created_at timestamptz not null default now(),
  unique(phone, call_session_id, from_call_type, to_call_type)
);
alter table public.phone_call_mode_switch_ledger enable row level security;
revoke all on public.phone_call_mode_switch_ledger from public, anon, authenticated;
grant all on public.phone_call_mode_switch_ledger to service_role;

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
  audio_slab public.receiver_coin_diamond_slabs;
  video_slab public.receiver_coin_diamond_slabs;
  existing_ledger public.phone_call_minute_ledger;
  daily_seconds integer;
  current_minute integer;
  audio_cost bigint;
  video_cost bigint;
  total_cost bigint;
  has_audio_minute boolean;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone) for update;
  if not found then raise exception 'Call session not found'; end if;
  if call_row.status <> 'connected' or call_row.call_type <> 'audio'
     or call_row.video_upgrade_requested_by is null then
    raise exception 'There is no pending video upgrade request';
  end if;
  if input_phone = call_row.video_upgrade_requested_by then
    raise exception 'The other participant must accept the video request'; end if;

  select coalesce(w.coins, 0) into wallet from public.phone_wallets w
  where w.phone = call_row.caller_phone for update;
  select greatest(0, coalesce(sum(l.duration_seconds), 0))::integer into daily_seconds
  from public.host_call_time_ledger l
  where l.host_phone = call_row.host_phone and l.call_date = current_date;
  select * into audio_slab from public.receiver_coin_diamond_slabs
  where is_active and call_type = 'AUDIO' and daily_seconds >= min_minutes * 60
    and (max_minutes is null or daily_seconds < max_minutes * 60)
  order by min_minutes desc limit 1;
  select * into video_slab from public.receiver_coin_diamond_slabs
  where is_active and call_type = 'VIDEO' and daily_seconds >= min_minutes * 60
    and (max_minutes is null or daily_seconds < max_minutes * 60)
  order by min_minutes desc limit 1;
  if not found then raise exception 'No active video receiver slab configured'; end if;
  if audio_slab.id is null then raise exception 'No active audio receiver slab configured'; end if;

  current_minute := floor(extract(epoch from now() - call_row.connected_at) / 60)::integer + 1;
  select * into existing_ledger from public.phone_call_minute_ledger
  where phone = call_row.caller_phone and call_session_id = input_session_id
    and minute_number = current_minute;
  has_audio_minute := found;
  audio_cost := ceil(audio_slab.diamonds_per_minute * audio_slab.coins_per_diamond)::bigint;
  video_cost := ceil(video_slab.diamonds_per_minute * video_slab.coins_per_diamond)::bigint;
  total_cost := video_cost + case when has_audio_minute then 0 else audio_cost end;
  if wallet.coins < total_cost then raise exception 'Insufficient coins for the video call rate'; end if;

  update public.phone_wallets set coins = coins - total_cost, updated_at = now()
  where phone = call_row.caller_phone;
  update public.phone_wallets set earnings_paise = earnings_paise + total_cost * 100, updated_at = now()
  where phone = call_row.host_phone;
  if not has_audio_minute then
    insert into public.phone_call_minute_ledger(phone, call_session_id, minute_number, diamonds_charged, coin_delta)
    values (call_row.caller_phone, input_session_id, current_minute, audio_slab.diamonds_per_minute, -audio_cost);
  end if;
  insert into public.phone_call_mode_switch_ledger(
    phone, call_session_id, from_call_type, to_call_type, diamonds_charged, coin_delta
  ) values (
    call_row.caller_phone, input_session_id, 'audio', 'video', video_slab.diamonds_per_minute, -video_cost
  );

  update public.call_sessions
  set call_type = 'video', video_upgrade_requested_by = null, video_upgrade_requested_at = null
  where id = input_session_id;
  return jsonb_build_object('call_type', 'video', 'coins_per_minute', video_cost,
    'remaining_coins', wallet.coins - total_cost);
end;
$$;

create or replace function public.get_phone_call_summary(input_session_id uuid, input_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare call_row public.call_sessions; total_coins bigint;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone);
  if not found then raise exception 'Call session not found'; end if;
  select coalesce(sum(charged), 0)::bigint into total_coins from (
    select -coin_delta as charged from public.phone_call_minute_ledger where call_session_id = input_session_id and phone = call_row.caller_phone
    union all select -coin_delta from public.phone_call_mode_switch_ledger where call_session_id = input_session_id and phone = call_row.caller_phone
    union all select -coin_delta from public.phone_wallet_ledger where call_session_id = input_session_id and phone = call_row.caller_phone
  ) charges;
  return jsonb_build_object('id', call_row.id, 'call_type', call_row.call_type,
    'status', call_row.status, 'duration_seconds', call_row.duration_seconds,
    'coins_charged', total_coins, 'connected', call_row.connected_at is not null);
end;
$$;

-- Final settlement must recognize the separately recorded upgrade charge.
create or replace function public.settle_phone_call(
  input_session_id uuid, input_phone text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare call_row public.call_sessions; caller_wallet public.phone_wallets; slab public.receiver_coin_diamond_slabs;
  daily_seconds integer; diamonds_per_minute numeric; total_diamonds numeric; minutes integer;
  total_charge bigint; prior_charge bigint; charge bigint; host_earnings bigint;
begin
  select * into call_row from public.call_sessions where id = input_session_id
    and caller_phone = input_phone and status in ('ended','missed','rejected','cancelled');
  if not found then raise exception 'Call cannot be settled'; end if;
  if exists (select 1 from public.phone_wallet_ledger where phone = call_row.caller_phone and call_session_id = input_session_id) then
    return jsonb_build_object('coins_charged',0,'diamonds_charged',0,'host_earnings_paise',0,'duration_seconds',call_row.duration_seconds,'already_settled',true);
  end if;
  select greatest(0, coalesce(sum(l.duration_seconds),0) - call_row.duration_seconds)::integer into daily_seconds
  from public.host_call_time_ledger l where l.host_phone = call_row.host_phone and l.call_date = current_date;
  select * into slab from public.receiver_coin_diamond_slabs where is_active and call_type = upper(call_row.call_type)
    and daily_seconds >= min_minutes * 60 and (max_minutes is null or daily_seconds < max_minutes * 60)
  order by min_minutes desc limit 1;
  if not found then raise exception 'No active receiver slab configured'; end if;
  minutes := case when call_row.duration_seconds > 0 then ceil(call_row.duration_seconds::numeric / 60)::integer else 0 end;
  diamonds_per_minute := slab.diamonds_per_minute;
  total_diamonds := minutes * diamonds_per_minute;
  total_charge := minutes * ceil(diamonds_per_minute * slab.coins_per_diamond)::bigint;
  select coalesce(sum(charged),0) into prior_charge from (
    select -coin_delta as charged from public.phone_call_minute_ledger where phone = call_row.caller_phone and call_session_id = input_session_id
    union all select -coin_delta from public.phone_call_mode_switch_ledger where phone = call_row.caller_phone and call_session_id = input_session_id
  ) charges;
  charge := greatest(0, total_charge - prior_charge); host_earnings := charge * 100;
  insert into public.phone_wallets(phone) values (call_row.caller_phone),(call_row.host_phone) on conflict (phone) do nothing;
  select * into caller_wallet from public.phone_wallets where phone = call_row.caller_phone for update;
  if caller_wallet.coins < charge then raise exception 'Insufficient coins'; end if;
  if charge > 0 then
    update public.phone_wallets set coins = coins - charge, updated_at = now() where phone = call_row.caller_phone;
    update public.phone_wallets set earnings_paise = earnings_paise + host_earnings, updated_at = now() where phone = call_row.host_phone;
  end if;
  insert into public.phone_wallet_ledger(phone,call_session_id,coin_delta) values (call_row.caller_phone,input_session_id,-charge);
  insert into public.phone_wallet_ledger(phone,call_session_id,earnings_delta_paise) values (call_row.host_phone,input_session_id,host_earnings);
  return jsonb_build_object('coins_charged',charge,'diamonds_charged',total_diamonds,'diamonds_per_minute',diamonds_per_minute,'host_earnings_paise',host_earnings,'duration_seconds',call_row.duration_seconds,'daily_seconds',daily_seconds);
end;
$$;

revoke all on function public.accept_phone_call_video_upgrade(uuid, text), public.get_phone_call_summary(uuid, text), public.settle_phone_call(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_phone_call_video_upgrade(uuid, text), public.get_phone_call_summary(uuid, text), public.settle_phone_call(uuid, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
