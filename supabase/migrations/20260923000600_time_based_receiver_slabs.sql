begin;

alter table public.receiver_coin_diamond_slabs
  drop constraint if exists receiver_coin_diamond_slabs_call_type_key;

alter table public.receiver_coin_diamond_slabs
  add column if not exists min_minutes integer not null default 0,
  add column if not exists max_minutes integer;

create unique index if not exists receiver_coin_diamond_slabs_type_min_idx
  on public.receiver_coin_diamond_slabs(call_type, min_minutes);

update public.receiver_coin_diamond_slabs
set min_minutes = 0,
    max_minutes = 15,
    diamonds_per_minute = 2.00
where min_minutes = 0;

insert into public.receiver_coin_diamond_slabs
  (call_type, min_minutes, max_minutes, diamonds_per_minute, coins_per_diamond, coins_per_rupee)
select call_type, 15, 45, 3.00, coins_per_diamond, coins_per_rupee
from public.receiver_coin_diamond_slabs
where min_minutes = 0
on conflict do nothing;

insert into public.receiver_coin_diamond_slabs
  (call_type, min_minutes, max_minutes, diamonds_per_minute, coins_per_diamond, coins_per_rupee)
select call_type, 45, null, 4.00, coins_per_diamond, coins_per_rupee
from public.receiver_coin_diamond_slabs
where min_minutes = 0
on conflict do nothing;

alter table public.receiver_coin_diamond_slabs
  add constraint receiver_coin_diamond_slabs_range_check
  check (min_minutes >= 0 and (max_minutes is null or max_minutes > min_minutes));

create or replace function public.get_receiver_coin_diamond_slab(
  input_host_phone text,
  input_call_type text,
  input_daily_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_seconds integer;
  slab public.receiver_coin_diamond_slabs;
begin
  if input_daily_seconds is null then
    select coalesce(sum(l.duration_seconds), 0)::integer
      + coalesce((
        select sum(greatest(0, floor(extract(epoch from now() - c.connected_at))::integer))
        from public.call_sessions c
        where c.host_phone = input_host_phone
          and c.status = 'connected'
          and c.connected_at >= current_date
      ), 0)
    into daily_seconds
    from public.host_call_time_ledger l
    where l.host_phone = input_host_phone
      and l.call_date = current_date;
  else
    daily_seconds := greatest(0, input_daily_seconds);
  end if;

  select *
  into slab
  from public.receiver_coin_diamond_slabs
  where is_active
    and call_type = upper(input_call_type)
    and daily_seconds >= min_minutes * 60
    and (max_minutes is null or daily_seconds < max_minutes * 60)
  order by min_minutes desc
  limit 1;

  if not found then
    raise exception 'No active receiver slab configured';
  end if;

  return jsonb_build_object(
    'id', slab.id,
    'call_type', slab.call_type,
    'min_minutes', slab.min_minutes,
    'max_minutes', slab.max_minutes,
    'diamonds_per_minute', slab.diamonds_per_minute,
    'coins_per_diamond', slab.coins_per_diamond,
    'coins_per_rupee', slab.coins_per_rupee,
    'daily_seconds', daily_seconds
  );
end;
$$;

revoke all on function public.get_receiver_coin_diamond_slab(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_receiver_coin_diamond_slab(text, text, integer)
  to anon, authenticated;

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
  rate integer;
  minutes integer;
  charge bigint;
  host_earnings bigint;
begin
  select * into call_row
  from public.call_sessions
  where id = input_session_id
    and caller_phone = input_phone
    and status in ('ended', 'missed', 'rejected', 'cancelled');
  if not found then raise exception 'Call cannot be settled'; end if;
  if exists (
    select 1 from public.phone_wallet_ledger
    where phone = call_row.caller_phone and call_session_id = input_session_id
  ) then
    return jsonb_build_object('coins_charged', 0, 'host_earnings_paise', 0,
      'duration_seconds', call_row.duration_seconds, 'already_settled', true);
  end if;

  select greatest(0,
    coalesce(sum(l.duration_seconds), 0) - call_row.duration_seconds
    + coalesce((
      select sum(greatest(0, floor(extract(epoch from now() - c.connected_at))::integer))
      from public.call_sessions c
      where c.host_phone = call_row.host_phone
        and c.status = 'connected'
        and c.connected_at >= current_date
    ), 0)
  )::integer
    into daily_seconds
    from public.host_call_time_ledger l
    where l.host_phone = call_row.host_phone
      and l.call_date = current_date;

  select * into slab
  from public.receiver_coin_diamond_slabs
  where is_active
    and call_type = upper(call_row.call_type)
    and daily_seconds >= min_minutes * 60
    and (max_minutes is null or daily_seconds < max_minutes * 60)
  order by min_minutes desc
  limit 1;
  if not found then raise exception 'No active receiver slab configured'; end if;

  rate := ceil(slab.diamonds_per_minute * slab.coins_per_diamond)::integer;
  minutes := greatest(1, ceil(call_row.duration_seconds::numeric / 60)::integer);
  charge := case when call_row.duration_seconds > 0 then minutes * rate else 0 end;
  host_earnings := charge * 100;

  insert into public.phone_wallets(phone)
  values (call_row.caller_phone), (call_row.host_phone)
  on conflict (phone) do nothing;

  select * into caller_wallet from public.phone_wallets
  where phone = call_row.caller_phone for update;
  if caller_wallet.coins < charge then raise exception 'Insufficient coins'; end if;

  update public.phone_wallets
  set coins = coins - charge, updated_at = now()
  where phone = call_row.caller_phone;
  update public.phone_wallets
  set earnings_paise = earnings_paise + host_earnings, updated_at = now()
  where phone = call_row.host_phone;

  insert into public.phone_wallet_ledger(phone, call_session_id, coin_delta)
  values (call_row.caller_phone, input_session_id, -charge)
  on conflict (phone, call_session_id) do nothing;
  insert into public.phone_wallet_ledger(phone, call_session_id, earnings_delta_paise)
  values (call_row.host_phone, input_session_id, host_earnings)
  on conflict (phone, call_session_id) do nothing;

  return jsonb_build_object(
    'coins_charged', charge,
    'host_earnings_paise', host_earnings,
    'duration_seconds', call_row.duration_seconds,
    'diamonds_per_minute', slab.diamonds_per_minute,
    'daily_seconds', daily_seconds
  );
end;
$$;

revoke all on function public.settle_phone_call(uuid, text)
  from public, anon, authenticated;
grant execute on function public.settle_phone_call(uuid, text)
  to anon, authenticated;

commit;
