begin;

-- Pricing is now fixed for every approved Host:
-- caller pricing: audio 2 diamonds (20 coins)/minute; video 4 diamonds
-- (40 coins)/minute. Hosts earn ₹5/audio minute and ₹10/video minute.
-- Coin-pack conversion is 1.5 coins/₹; each call diamond is 10 coins.
drop function if exists public.get_phone_wallet_balance(text);

alter table public.phone_wallets
  alter column coins type numeric(12,1) using coins::numeric(12,1),
  alter column coins set default 1250.0;

alter table public.phone_wallet_ledger
  alter column coin_delta type numeric(12,1) using coin_delta::numeric(12,1);

alter table public.phone_call_minute_ledger
  alter column coin_delta type numeric(12,1) using coin_delta::numeric(12,1),
  drop constraint if exists phone_call_minute_ledger_diamonds_charged_check,
  alter column diamonds_charged set default 0,
  add constraint phone_call_minute_ledger_diamonds_charged_check
    check (diamonds_charged >= 0);

alter table public.phone_message_wallet_ledger
  alter column coin_delta type numeric(12,1) using coin_delta::numeric(12,1);

alter table public.phone_wallet_recharge_ledger
  alter column coin_delta type numeric(12,1) using coin_delta::numeric(12,1);

alter table public.phone_call_mode_switch_ledger
  alter column coin_delta type numeric(12,1) using coin_delta::numeric(12,1);

alter table public.coin_packs
  alter column coins type numeric(12,1) using coins::numeric(12,1),
  alter column bonus_coins type numeric(12,1) using bonus_coins::numeric(12,1);

alter table public.phone_payment_orders
  alter column coins type numeric(12,1) using coins::numeric(12,1);

-- Preserve the relative value of each existing pack and special-offer bonus.
-- Existing user wallet balances are intentionally not changed: those coins were
-- purchased under the previous conversion and remain valid.
update public.coin_packs
set coins = coins / 2,
    bonus_coins = bonus_coins / 2;

update public.app_policies_and_settings
set content = jsonb_set(
  jsonb_set(
    jsonb_set(content, '{coins_per_rupee}', '1.5'::jsonb, true),
    '{coins_per_diamond}', '10'::jsonb, true
  ),
  '{audio_rate_diamonds_per_min}', '2'::jsonb, true
),
updated_at = now()
where key = 'app_config';

update public.app_policies_and_settings
set content = jsonb_set(
  jsonb_set(
    content,
    '{video_rate_diamonds_per_min}', '4'::jsonb, true
  ),
  '{audio_host_earnings_rupees_per_minute}', '5'::jsonb, true
),
updated_at = now()
where key = 'app_config';

update public.app_policies_and_settings
set content = jsonb_set(content, '{video_host_earnings_rupees_per_minute}', '10'::jsonb, true),
    updated_at = now()
where key = 'app_config';

create or replace function public.get_phone_wallet_balance(input_phone text)
returns numeric(12,1)
language sql
security definer
set search_path = ''
as $$
  select coalesce((select coins from public.phone_wallets where phone = input_phone), 0.0)::numeric(12,1);
$$;

create or replace function public.get_phone_host_earnings(input_phone text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select coalesce((select earnings_paise from public.phone_wallets where phone = input_phone), 0);
$$;

create or replace function public.submit_phone_host_application(
  input_phone text,
  input_application jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_id uuid;
  normalized_application jsonb;
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$'
     or input_application is null
     or jsonb_typeof(input_application) <> 'object' then
    raise exception 'Invalid host application data';
  end if;

  if not exists (
    select 1 from public.phone_profiles
    where phone = input_phone and gender = 'Female'
  ) then
    raise exception 'Only completed female profiles can apply to become a host';
  end if;

  normalized_application := jsonb_set(
    jsonb_set(input_application, '{audioRate}', '"5"'::jsonb, true),
    '{videoRate}', '"10"'::jsonb, true
  );

  insert into public.host_applications (
    phone, status, application_profile, submitted_at
  )
  values (input_phone, 'pending', normalized_application, now())
  on conflict (phone) where phone is not null do update set
    status = 'pending',
    application_profile = excluded.application_profile,
    submitted_at = now(),
    reviewed_at = null,
    review_note = null
  returning id into application_id;

  return application_id;
end;
$$;

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
  coin_cost numeric(12,1);
  host_earnings_paise bigint;
begin
  if input_minute_number < 1 then
    raise exception 'Invalid call minute';
  end if;

  select * into call_row
  from public.call_sessions
  where id = input_session_id and caller_phone = input_phone
  for update;

  select coalesce(w.coins, 0.0) into wallet
  from public.phone_wallets w
  where w.phone = input_phone;

  if call_row.id is null or call_row.status <> 'connected' or call_row.connected_at is null then
    return jsonb_build_object(
      'charged', false, 'call_active', false, 'minute_complete', false,
      'remaining_coins', coalesce(wallet.coins, 0.0)
    );
  end if;

  if floor(extract(epoch from now() - call_row.connected_at) / 60)::integer < input_minute_number then
    return jsonb_build_object(
      'charged', false, 'call_active', true, 'minute_complete', false,
      'remaining_coins', coalesce(wallet.coins, 0.0)
    );
  end if;

  if exists (
    select 1 from public.phone_call_minute_ledger
    where phone = input_phone and call_session_id = input_session_id
      and minute_number = input_minute_number
  ) then
    select -coin_delta into coin_cost
    from public.phone_call_minute_ledger
    where phone = input_phone and call_session_id = input_session_id
      and minute_number = input_minute_number;
    return jsonb_build_object(
      'charged', true, 'already_charged', true, 'call_active', true,
      'minute_complete', true, 'coins_charged', coin_cost,
      'remaining_coins', coalesce(wallet.coins, 0.0)
    );
  end if;

  coin_cost := case call_row.call_type when 'video' then 40.0 else 20.0 end;
  host_earnings_paise := case call_row.call_type when 'video' then 1000 else 500 end;

  insert into public.phone_wallets(phone) values (input_phone)
  on conflict (phone) do nothing;
  select * into wallet from public.phone_wallets
  where phone = input_phone for update;

  if wallet.coins < coin_cost then
    return jsonb_build_object(
      'charged', false, 'call_active', true, 'minute_complete', true,
      'insufficient_balance', true, 'coins_required', coin_cost,
      'remaining_coins', wallet.coins
    );
  end if;

  update public.phone_wallets
  set coins = coins - coin_cost, updated_at = now()
  where phone = input_phone;
  update public.phone_wallets
  set earnings_paise = earnings_paise + host_earnings_paise, updated_at = now()
  where phone = call_row.host_phone;
  insert into public.phone_call_minute_ledger(
    phone, call_session_id, minute_number, diamonds_charged, coin_delta
  ) values (input_phone, input_session_id, input_minute_number, 0, -coin_cost);

  return jsonb_build_object(
    'charged', true, 'already_charged', false, 'call_active', true,
    'minute_complete', true, 'coins_charged', coin_cost,
    'remaining_coins', wallet.coins - coin_cost
  );
end;
$$;

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
  if caller_wallet.coins < charge then
    raise exception 'Insufficient coins';
  end if;

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

revoke all on function public.get_phone_wallet_balance(text), public.get_phone_host_earnings(text),
  public.submit_phone_host_application(text, jsonb),
  public.charge_phone_call_minute(uuid, text, integer),
  public.settle_phone_call(uuid, text) from public, anon, authenticated;
grant execute on function public.get_phone_wallet_balance(text), public.get_phone_host_earnings(text),
  public.submit_phone_host_application(text, jsonb),
  public.charge_phone_call_minute(uuid, text, integer),
  public.settle_phone_call(uuid, text) to anon, authenticated;

commit;
