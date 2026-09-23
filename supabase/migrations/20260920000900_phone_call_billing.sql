begin;

create table if not exists public.phone_wallets (
  phone text primary key references public.phone_identities(phone) on delete cascade,
  coins bigint not null default 1250 check (coins >= 0),
  earnings_paise bigint not null default 0 check (earnings_paise >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.phone_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  phone text not null references public.phone_identities(phone),
  call_session_id uuid not null references public.call_sessions(id),
  coin_delta bigint not null default 0,
  earnings_delta_paise bigint not null default 0,
  created_at timestamptz not null default now(),
  unique(phone, call_session_id)
);
alter table public.call_sessions replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.call_sessions;
exception when duplicate_object then null;
end $$;

alter table public.phone_wallets enable row level security;
alter table public.phone_wallet_ledger enable row level security;
revoke all on public.phone_wallets from public, anon, authenticated;
revoke all on public.phone_wallet_ledger from public, anon, authenticated;
grant all on public.phone_wallets to service_role;
grant all on public.phone_wallet_ledger to service_role;

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
  host_wallet public.phone_wallets;
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

  rate := case when call_row.call_type = 'video' then 50 else 20 end;
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
    'duration_seconds', call_row.duration_seconds
  );
end;
$$;

revoke all on function public.settle_phone_call(uuid, text)
  from public, anon, authenticated;
grant execute on function public.settle_phone_call(uuid, text)
  to anon, authenticated;

commit;
