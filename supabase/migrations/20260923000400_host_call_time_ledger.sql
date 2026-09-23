begin;

create table if not exists public.host_call_time_ledger (
  id uuid primary key default gen_random_uuid(),
  host_phone text not null references public.phone_identities(phone),
  call_session_id uuid not null unique references public.call_sessions(id),
  call_date date not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists host_call_time_ledger_host_date_idx
  on public.host_call_time_ledger(host_phone, call_date);

alter table public.host_call_time_ledger enable row level security;
revoke all on public.host_call_time_ledger from public, anon, authenticated;
grant all on public.host_call_time_ledger to service_role;

insert into public.host_call_time_ledger (
  host_phone, call_session_id, call_date, duration_seconds
)
select host_phone, id, (coalesce(ended_at, created_at))::date, greatest(duration_seconds, 0)
from public.call_sessions
where status = 'ended'
  and connected_at is not null
on conflict (call_session_id) do nothing;

create or replace function public.capture_host_call_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'connected'
     and new.status = 'ended'
     and new.connected_at is not null then
    insert into public.host_call_time_ledger (
      host_phone, call_session_id, call_date, duration_seconds
    )
    values (
      new.host_phone,
      new.id,
      coalesce(new.ended_at, now())::date,
      greatest(new.duration_seconds, 0)
    )
    on conflict (call_session_id) do update
      set duration_seconds = excluded.duration_seconds,
          call_date = excluded.call_date;
  end if;
  return new;
end;
$$;

drop trigger if exists capture_host_call_time on public.call_sessions;
create trigger capture_host_call_time
after update of status, duration_seconds, ended_at on public.call_sessions
for each row execute function public.capture_host_call_time();

create or replace function public.get_host_daily_call_time(input_phone text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'seconds',
      coalesce((
        select sum(duration_seconds)
        from public.host_call_time_ledger
        where host_phone = input_phone
          and call_date = current_date
      ), 0)
      + coalesce((
        select sum(greatest(0, floor(extract(epoch from now() - c.connected_at))::integer))
        from public.call_sessions c
        where c.host_phone = input_phone
          and c.status = 'connected'
          and c.connected_at >= current_date
      ), 0),
    'calls',
      (
        select count(*)
        from public.host_call_time_ledger
        where host_phone = input_phone
          and call_date = current_date
      )
      + (
        select count(*)
        from public.call_sessions c
        where c.host_phone = input_phone
          and c.status = 'connected'
          and c.connected_at >= current_date
      ),
    'date', current_date
  );
$$;

revoke all on function public.get_host_daily_call_time(text) from public;
grant execute on function public.get_host_daily_call_time(text) to anon, authenticated;

commit;
