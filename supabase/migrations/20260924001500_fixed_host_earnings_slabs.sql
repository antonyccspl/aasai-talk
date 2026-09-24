begin;

create table if not exists public.phone_host_earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  host_phone text not null references public.phone_identities(phone),
  call_session_id uuid not null references public.call_sessions(id),
  source_id uuid not null unique,
  source_kind text not null check (source_kind in ('minute', 'video_upgrade')),
  call_type text not null check (call_type in ('audio', 'video')),
  earnings_paise bigint not null check (earnings_paise > 0),
  created_at timestamptz not null default now()
);
create index if not exists phone_host_earnings_ledger_host_created_idx on public.phone_host_earnings_ledger(host_phone, created_at desc);
alter table public.phone_host_earnings_ledger enable row level security;
revoke all on public.phone_host_earnings_ledger from public, anon, authenticated;
grant all on public.phone_host_earnings_ledger to service_role;

create or replace function public.host_rate_paise(input_call_type text, input_daily_seconds integer)
returns bigint language sql immutable set search_path = '' as $$
  select case upper(input_call_type)
    when 'AUDIO' then case when input_daily_seconds < 15 * 60 then 200 when input_daily_seconds < 45 * 60 then 300 else 400 end
    when 'VIDEO' then case when input_daily_seconds < 15 * 60 then 400 when input_daily_seconds < 45 * 60 then 600 else 800 end
    else 0 end;
$$;

create or replace function public.capture_fixed_host_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.call_sessions; prior_seconds integer; rate bigint; charged_coins bigint;
begin
  select * into c from public.call_sessions where id = new.call_session_id;
  if not found then return new; end if;
  select coalesce(sum(duration_seconds), 0)::integer into prior_seconds
  from public.host_call_time_ledger where host_phone = c.host_phone and call_date = current_date;
  rate := public.host_rate_paise(case when TG_TABLE_NAME = 'phone_call_mode_switch_ledger' then 'video' else c.call_type end, prior_seconds);
  if rate = 0 then return new; end if;
  charged_coins := -new.coin_delta;
  insert into public.phone_host_earnings_ledger(host_phone, call_session_id, source_id, source_kind, call_type, earnings_paise)
  values (c.host_phone, c.id, new.id,
    case when TG_TABLE_NAME = 'phone_call_mode_switch_ledger' then 'video_upgrade' else 'minute' end,
    case when TG_TABLE_NAME = 'phone_call_mode_switch_ledger' then 'video' else c.call_type end, rate)
  on conflict (source_id) do nothing;
  if found then
    -- The existing billing functions already credited coin value. Replace that
    -- credit atomically with the fixed host rupee rate for this billed minute.
    update public.phone_wallets set earnings_paise = greatest(0, earnings_paise - charged_coins * 100 + rate), updated_at = now()
    where phone = c.host_phone;
  end if;
  return new;
end;
$$;

drop trigger if exists capture_fixed_host_earnings_minute on public.phone_call_minute_ledger;
create trigger capture_fixed_host_earnings_minute after insert on public.phone_call_minute_ledger
for each row execute function public.capture_fixed_host_earnings();
drop trigger if exists capture_fixed_host_earnings_upgrade on public.phone_call_mode_switch_ledger;
create trigger capture_fixed_host_earnings_upgrade after insert on public.phone_call_mode_switch_ledger
for each row execute function public.capture_fixed_host_earnings();

create or replace function public.get_phone_host_dashboard(input_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if input_phone !~ '^\+91[0-9]{10}$' then raise exception 'Invalid phone'; end if;
  return jsonb_build_object(
    'today_calls', (select count(*) from public.host_call_time_ledger where host_phone=input_phone and call_date=current_date),
    'today_seconds', coalesce((select sum(duration_seconds) from public.host_call_time_ledger where host_phone=input_phone and call_date=current_date),0) + coalesce((select sum(greatest(0,floor(extract(epoch from now()-connected_at))::integer)) from public.call_sessions where host_phone=input_phone and status='connected' and connected_at>=current_date),0),
    'today_earnings_paise', coalesce((select sum(earnings_paise) from public.phone_host_earnings_ledger where host_phone=input_phone and created_at>=current_date),0),
    'total_calls', (select count(*) from public.host_call_time_ledger where host_phone=input_phone),
    'total_earnings_paise', coalesce((select sum(earnings_paise) from public.phone_host_earnings_ledger where host_phone=input_phone),0),
    'active_calls', (select count(*) from public.call_sessions where host_phone=input_phone and status='connected'),
    'missed_calls', (select count(*) from public.call_sessions where host_phone=input_phone and status in ('missed','rejected')),
    'recent_calls', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'caller_phone',c.caller_phone,'call_type',c.call_type,'status',c.status,'duration_seconds',c.duration_seconds,'created_at',c.created_at) order by c.created_at desc) from (select * from public.call_sessions where host_phone=input_phone and status in ('ended','missed','rejected') order by created_at desc limit 5)c),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_phone_host_dashboard(text) from public;
grant execute on function public.get_phone_host_dashboard(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
