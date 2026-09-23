begin;

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  caller_phone text not null references public.phone_identities(phone),
  host_phone text not null references public.phone_identities(phone),
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'connected', 'ended', 'missed', 'rejected', 'cancelled')),
  room_id text not null unique,
  started_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists call_sessions_caller_created
  on public.call_sessions(caller_phone, created_at desc);
create index if not exists call_sessions_host_created
  on public.call_sessions(host_phone, created_at desc);

alter table public.call_sessions enable row level security;
revoke all on public.call_sessions from public, anon, authenticated;
grant all on public.call_sessions to service_role;

create or replace function public.start_phone_call(
  input_caller_phone text,
  input_host_phone text,
  input_call_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.call_sessions;
begin
  if input_caller_phone is null or input_host_phone is null
     or input_caller_phone = input_host_phone
     or input_caller_phone !~ '^\+91[0-9]{10}$'
     or input_host_phone !~ '^\+91[0-9]{10}$'
     or input_call_type not in ('audio', 'video') then
    raise exception 'Invalid call request';
  end if;

  if not exists (
    select 1 from public.phone_profiles
    where phone = input_caller_phone and gender = 'Male'
  ) then
    raise exception 'Only male users can start Host calls';
  end if;

  if not exists (
    select 1
    from public.phone_profiles p
    join public.host_applications h on h.phone = p.phone
    where p.phone = input_host_phone
      and p.gender = 'Female'
      and h.status = 'approved'
  ) then
    raise exception 'The selected user is not an approved Host';
  end if;

  if exists (
    select 1 from public.call_sessions
    where (caller_phone = input_caller_phone or host_phone = input_caller_phone)
      and status in ('ringing', 'connected')
  ) then
    raise exception 'You already have an active call';
  end if;

  insert into public.call_sessions (
    caller_phone, host_phone, call_type, status, room_id
  )
  values (
    input_caller_phone, input_host_phone, input_call_type, 'ringing',
    'aasai-' || replace(gen_random_uuid()::text, '-', '')
  )
  returning * into session_row;

  return jsonb_build_object(
    'id', session_row.id,
    'room_id', session_row.room_id,
    'status', session_row.status,
    'call_type', session_row.call_type
  );
end;
$$;

create or replace function public.update_phone_call(
  input_session_id uuid,
  input_phone text,
  input_status text,
  input_duration_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.call_sessions;
begin
  if input_status not in ('connected', 'ended', 'missed', 'rejected', 'cancelled')
     or input_duration_seconds < 0 then
    raise exception 'Invalid call status';
  end if;

  select * into session_row
  from public.call_sessions
  where id = input_session_id
    and (caller_phone = input_phone or host_phone = input_phone);
  if not found then raise exception 'Call session not found'; end if;

  update public.call_sessions
  set status = input_status,
      connected_at = case
        when input_status = 'connected' then coalesce(connected_at, now())
        else connected_at
      end,
      started_at = case
        when input_status = 'connected' then coalesce(started_at, now())
        else started_at
      end,
      ended_at = case
        when input_status in ('ended', 'missed', 'rejected', 'cancelled') then now()
        else ended_at
      end,
      duration_seconds = case
        when input_status in ('ended', 'missed', 'rejected', 'cancelled')
          then input_duration_seconds
        else duration_seconds
      end
  where id = input_session_id;
end;
$$;

revoke all on function public.start_phone_call(text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_phone_call(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.start_phone_call(text, text, text)
  to anon, authenticated;
grant execute on function public.update_phone_call(uuid, text, text, integer)
  to anon, authenticated;

commit;
