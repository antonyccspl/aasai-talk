begin;

create or replace function public.capture_fixed_host_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.call_sessions; prior_seconds integer; rate bigint; charged_coins bigint; current_elapsed integer;
begin
  select * into c from public.call_sessions where id = new.call_session_id;
  if not found then return new; end if;
  select coalesce(sum(duration_seconds), 0)::integer into prior_seconds
  from public.host_call_time_ledger where host_phone = c.host_phone and call_date = current_date;
  -- Include this active call: minute 16 starts at 15:00, so it earns at tier 2.
  if TG_TABLE_NAME = 'phone_call_minute_ledger' then
    prior_seconds := prior_seconds + greatest(0, (new.minute_number - 1) * 60);
  else
    current_elapsed := greatest(0, floor(extract(epoch from now() - c.connected_at))::integer);
    prior_seconds := prior_seconds + current_elapsed;
  end if;
  rate := public.host_rate_paise(case when TG_TABLE_NAME = 'phone_call_mode_switch_ledger' then 'video' else c.call_type end, prior_seconds);
  if rate = 0 then return new; end if;
  charged_coins := -new.coin_delta;
  insert into public.phone_host_earnings_ledger(host_phone, call_session_id, source_id, source_kind, call_type, earnings_paise)
  values (c.host_phone, c.id, new.id,
    case when TG_TABLE_NAME = 'phone_call_mode_switch_ledger' then 'video_upgrade' else 'minute' end,
    case when TG_TABLE_NAME = 'phone_call_mode_switch_ledger' then 'video' else c.call_type end, rate)
  on conflict (source_id) do nothing;
  if found then
    update public.phone_wallets set earnings_paise = greatest(0, earnings_paise - charged_coins * 100 + rate), updated_at = now()
    where phone = c.host_phone;
  end if;
  return new;
end;
$$;

commit;
