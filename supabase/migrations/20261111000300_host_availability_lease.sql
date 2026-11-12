begin;
create table public.host_presence_config (
  singleton boolean primary key default true check (singleton),
  timeout_seconds integer not null default 300 check (timeout_seconds between 120 and 3600)
);
insert into public.host_presence_config default values;
alter table public.host_presence_config enable row level security;
revoke all on public.host_presence_config from public, anon, authenticated;
grant all on public.host_presence_config to service_role;

-- Stored subscriptions never extend this server-clock lease.
create or replace function public.phone_host_is_online(input_host_phone text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.phone_host_presence p
    cross join public.host_presence_config config
    where p.host_phone = input_host_phone and p.accepting_calls
      and p.last_seen_at > now() - make_interval(secs => config.timeout_seconds)
  );
$$;
revoke all on function public.phone_host_is_online(text) from public, anon, authenticated;
grant execute on function public.phone_host_is_online(text) to service_role;

-- Account-wide intent is independent of the lease; heartbeats never enable calls.
create or replace function public.set_phone_host_call_availability(input_host_phone text, input_accepting_calls boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if input_host_phone is null or input_host_phone !~ '^[+]91[0-9]{10}$' or input_accepting_calls is null then
    raise exception 'Invalid Host call availability';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(input_host_phone, 0));
  insert into public.phone_host_presence(host_phone, accepting_calls, last_seen_at)
  values(input_host_phone, input_accepting_calls, now())
  on conflict(host_phone) do update set accepting_calls = excluded.accepting_calls,
    last_seen_at = case when excluded.accepting_calls then now() else phone_host_presence.last_seen_at end;
  if not input_accepting_calls then
    update public.call_sessions set status = 'missed', ended_at = now(), duration_seconds = 0
    where host_phone = input_host_phone and status = 'ringing';
  end if;
end;
$$;
revoke all on function public.set_phone_host_call_availability(text, boolean) from public, anon, authenticated;
grant execute on function public.set_phone_host_call_availability(text, boolean) to service_role;

-- Online status expires at read/admission time even if cron is delayed.
-- Retain the last-seen history and manual preference when a connection expires.
create or replace function public.expire_host_presence()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.call_sessions set status = 'missed', ended_at = now(), duration_seconds = 0
  where status = 'ringing' and
    (created_at <= now() - interval '60 seconds' or not public.phone_host_is_online(host_phone));
end;
$$;
revoke all on function public.expire_host_presence() from public, anon, authenticated;
grant execute on function public.expire_host_presence() to service_role;


create or replace function public.get_public_directory_profiles()
returns table (
  id text,
  display_name text,
  age smallint,
  gender text,
  city text,
  languages text[],
  interests text[],
  bio text,
  availability text,
  avatar_url text,
  accent_color text,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    'phone_' || replace(replace(replace(pp.phone, '+', ''), ' ', ''), '-', ''),
    coalesce(nullif(trim(ha.application_profile ->> 'name'), ''), pp.display_name),
    extract(year from age(current_date, pp.date_of_birth))::smallint,
    pp.gender,
    pp.city,
    pp.languages,
    case
      when jsonb_typeof(ha.application_profile -> 'interests') = 'array'
        then array(select jsonb_array_elements_text(ha.application_profile -> 'interests'))
      else pp.interests
    end,
    coalesce(ha.application_profile ->> 'bio', pp.bio),
    case
      when exists (
        select 1
        from public.call_sessions call
        where call.host_phone = pp.phone
          and (
            call.status = 'connected'
            or (call.status = 'ringing' and call.created_at >= now() - interval '60 seconds')
          )
      ) then 'Busy'
      when public.phone_host_is_online(pp.phone) then 'Available'
      else 'Offline'
    end,
    coalesce(nullif(trim(ha.application_profile ->> 'photo'), ''), pp.avatar_url),
    '#285647',
    case
      when presence.show_last_seen
        and presence.last_seen_at > timestamptz '2000-01-01'
        then presence.last_seen_at
      else null
    end
  from public.phone_profiles pp
  join public.host_applications ha on ha.phone = pp.phone
  left join public.phone_host_presence presence on presence.host_phone = pp.phone
  where ha.status = 'approved'
    and pp.gender = 'Female'
    and pp.date_of_birth is not null
    and extract(year from age(current_date, pp.date_of_birth)) between 18 and 120
  order by 3 asc, 2 asc;
$$;

revoke all on function public.get_public_directory_profiles()
  from public, anon, authenticated;
grant execute on function public.get_public_directory_profiles()
  to anon, authenticated;

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
  application jsonb;
  preference_enabled boolean;
begin
  if input_caller_phone is null or input_host_phone is null
     or input_caller_phone = input_host_phone
     or input_caller_phone !~ '^[+]91[0-9]{10}$'
     or input_host_phone !~ '^[+]91[0-9]{10}$'
     or input_call_type not in ('audio', 'video') then
    raise exception 'Invalid call request';
  end if;
  if exists (
    select 1 from public.phone_user_blocks block
    where (block.blocker_phone = input_caller_phone and block.blocked_phone = input_host_phone)
       or (block.blocker_phone = input_host_phone and block.blocked_phone = input_caller_phone)
  ) then raise exception 'Calls are unavailable for this connection'; end if;

  if not exists (
    select 1
    from public.phone_identities identity
    left join public.phone_profiles profile on profile.phone = identity.phone
    where identity.phone = input_caller_phone and identity.profile_complete
      and coalesce(profile.gender, identity.profile ->> 'gender') = 'Male'
  ) then raise exception 'Only male users can start Host calls'; end if;

  perform pg_advisory_xact_lock(hashtextextended(input_host_phone, 0));

  select host.application_profile,
         case input_call_type
           when 'audio' then coalesce(presence.accepting_audio_calls, true)
           when 'video' then coalesce(presence.accepting_video_calls, true)
         end
    into application, preference_enabled
  from public.phone_profiles profile
  join public.host_applications host on host.phone = profile.phone
  left join public.phone_host_presence presence on presence.host_phone = host.phone
  where profile.phone = input_host_phone
    and profile.gender = 'Female'
    and host.status = 'approved';
  if not found then raise exception 'The selected user is not an approved Host'; end if;
  if not preference_enabled
     or not coalesce((application ->> input_call_type)::boolean, false) then
    raise exception 'This Host does not accept % calls', input_call_type;
  end if;

  update public.call_sessions
  set status = 'missed', ended_at = now(), duration_seconds = 0
  where host_phone = input_host_phone
    and status = 'ringing'
    and created_at < now() - interval '60 seconds';

  if exists (
    select 1 from public.call_sessions
    where host_phone = input_host_phone and status in ('ringing', 'connected')
  ) then raise exception 'Host is busy on another call'; end if;

  if not public.phone_host_is_online(input_host_phone) then raise exception 'Host is offline'; end if;

  update public.call_sessions set status = 'cancelled', ended_at = now(), duration_seconds = 0
  where caller_phone = input_caller_phone and status = 'ringing';
  if exists (
    select 1 from public.call_sessions
    where (caller_phone = input_caller_phone or host_phone = input_caller_phone)
      and status = 'connected'
  ) then raise exception 'You already have an active call'; end if;

  insert into public.call_sessions (caller_phone, host_phone, call_type, status, room_id)
  values (input_caller_phone, input_host_phone, input_call_type, 'ringing',
    'aasai-' || replace(gen_random_uuid()::text, '-', ''))
  returning * into session_row;
  return jsonb_build_object('id', session_row.id, 'room_id', session_row.room_id,
    'status', session_row.status, 'call_type', session_row.call_type);
end;
$$;

revoke all on function public.start_phone_call(text, text, text)
  from public, anon, authenticated;
grant execute on function public.start_phone_call(text, text, text)
  to anon, authenticated;

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
  if input_status is null or input_status not in ('connected', 'ended', 'missed', 'rejected', 'cancelled')
     or input_duration_seconds is null or input_duration_seconds < 0 then
    raise exception 'Invalid call status';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(c.host_phone, 0))
  from public.call_sessions c where c.id = input_session_id;

  select * into session_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone)
  for update;
  if not found then
    raise exception 'Call session not found';
  end if;

  if input_status = 'connected' then
    if input_phone <> session_row.host_phone then
      raise exception 'Only the Host can accept this call';
    end if;
    if session_row.status <> 'ringing' then return; end if;
    if not public.phone_host_is_online(session_row.host_phone) then
      raise exception 'Host is offline';
    end if;
    if session_row.created_at < now() - interval '60 seconds' then
      raise exception 'This call invitation has expired';
    end if;
  elsif input_status in ('missed', 'rejected', 'cancelled') then
    if session_row.status <> 'ringing' then return; end if;
    if input_status = 'rejected' and input_phone <> session_row.host_phone then
      raise exception 'Only the Host can decline this call';
    end if;
    if input_status = 'cancelled' and input_phone <> session_row.caller_phone then
      raise exception 'Only the caller can cancel this call';
    end if;
  elsif input_status = 'ended' and session_row.status <> 'connected' then
    return;
  end if;

  update public.call_sessions
  set status = input_status,
      connected_at = case when input_status = 'connected' then coalesce(connected_at, now()) else connected_at end,
      started_at = case when input_status = 'connected' then coalesce(started_at, now()) else started_at end,
      ended_at = case when input_status <> 'connected' then now() else ended_at end,
      duration_seconds = case when input_status <> 'connected'
        then case when connected_at is null then 0 else greatest(0, floor(extract(epoch from now() - connected_at))::integer) end
        else duration_seconds end
  where id = input_session_id;

  if input_status = 'ended' then
    perform public.settle_phone_call(input_session_id, session_row.caller_phone);
  end if;
end;
$$;

revoke all on function public.update_phone_call(uuid, text, text, integer) from public;
grant execute on function public.update_phone_call(uuid, text, text, integer) to anon, authenticated;


create extension if not exists pg_cron;
select cron.schedule('expire-host-presence', '* * * * *', 'select public.expire_host_presence()');

notify pgrst, 'reload schema';

commit;
