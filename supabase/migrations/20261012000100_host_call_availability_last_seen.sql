begin;

alter table public.phone_host_presence
  add column if not exists accepting_calls boolean not null default false,
  add column if not exists show_last_seen boolean not null default true;

drop function public.get_public_directory_profiles();

create function public.get_public_directory_profiles()
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
      when presence.last_seen_at > now() - interval '60 seconds'
        and (
          presence.accepting_calls
          or not exists (
            select 1
            from public.phone_push_tokens device
            where device.phone = pp.phone and device.platform = 'android'
          )
        )
        then 'Available'
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
    select 1 from public.phone_identities identity
    left join public.phone_profiles profile on profile.phone = identity.phone
    where identity.phone = input_caller_phone and identity.profile_complete
      and coalesce(profile.gender, identity.profile ->> 'gender') = 'Male'
  ) then raise exception 'Only male users can start Host calls'; end if;

  select host.application_profile into application
  from public.phone_profiles profile
  join public.host_applications host on host.phone = profile.phone
  where profile.phone = input_host_phone and profile.gender = 'Female' and host.status = 'approved';
  if not found then raise exception 'The selected user is not an approved Host'; end if;
  if not coalesce((application ->> input_call_type)::boolean, false) then
    raise exception 'This Host does not accept % calls', input_call_type;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(input_host_phone, 0));
  update public.call_sessions
  set status = 'missed', ended_at = now(), duration_seconds = 0
  where host_phone = input_host_phone
    and status = 'ringing'
    and created_at < now() - interval '60 seconds';

  if exists (
    select 1 from public.call_sessions
    where host_phone = input_host_phone and status in ('ringing', 'connected')
  ) then raise exception 'Host is busy on another call'; end if;

  if exists (
    select 1
    from public.phone_push_tokens device
    where device.phone = input_host_phone and device.platform = 'android'
  ) and not exists (
    select 1 from public.phone_host_presence
    where host_phone = input_host_phone and accepting_calls
  ) then raise exception 'Host is not accepting calls'; end if;
  if not exists (
    select 1 from public.phone_host_presence
    where host_phone = input_host_phone
      and last_seen_at > now() - interval '60 seconds'
  ) then raise exception 'Host is offline'; end if;

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

create or replace function public.set_phone_host_call_availability(
  input_host_phone text,
  input_accepting_calls boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_host_phone is null
     or input_host_phone !~ '^[+]91[0-9]{10}$'
     or input_accepting_calls is null then
    raise exception 'Invalid Host call availability';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(input_host_phone, 0));

  insert into public.phone_host_presence (
    host_phone,
    accepting_calls,
    last_seen_at
  )
  values (input_host_phone, input_accepting_calls, now())
  on conflict (host_phone) do update
    set accepting_calls = excluded.accepting_calls;

  if not input_accepting_calls then
    update public.call_sessions
    set status = 'missed', ended_at = now(), duration_seconds = 0
    where host_phone = input_host_phone and status = 'ringing';
  end if;
end;
$$;

revoke all on function public.set_phone_host_call_availability(text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_phone_host_call_availability(text, boolean)
  to service_role;

create or replace function public.record_phone_host_heartbeat(input_host_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_host_phone is null
     or input_host_phone !~ '^[+]91[0-9]{10}$' then
    raise exception 'Invalid Host presence heartbeat';
  end if;

  insert into public.phone_host_presence (host_phone, last_seen_at)
  values (input_host_phone, now())
  on conflict (host_phone) do update
    set last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.record_phone_host_heartbeat(text)
  from public, anon, authenticated;
grant execute on function public.record_phone_host_heartbeat(text)
  to service_role;

drop function public.get_phone_call_history(text, integer);

create function public.get_phone_call_history(
  input_phone text,
  input_limit integer default 50
)
returns table(
  id uuid,
  other_phone text,
  call_type text,
  status text,
  duration_seconds integer,
  incoming boolean,
  created_at timestamptz,
  counterpart_username text,
  counterpart_display_name text,
  counterpart_avatar_url text,
  counterpart_is_host boolean,
  counterpart_last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_gender text;
begin
  if input_phone is null or length(input_phone) <> 13
    or left(input_phone, 3) <> '+91'
    or substring(input_phone from 4) !~ '^[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  select profile.gender into requester_gender
  from public.phone_profiles profile
  where profile.phone = input_phone;

  return query
  select recent.id,
    case when recent.incoming then recent.caller_phone else recent.host_phone end,
    recent.call_type,
    recent.status,
    recent.duration_seconds,
    recent.incoming,
    recent.created_at,
    coalesce(nullif(profile.username, ''), 'member_' || substr(md5(profile.phone), 1, 8)),
    case
      when recent.incoming and profile.gender = 'Male' then null
      when application.phone is not null then coalesce(nullif(trim(application.application_profile ->> 'name'), ''), profile.display_name)
      else profile.display_name
    end,
    case
      when recent.incoming and profile.gender = 'Male' then null
      when application.phone is not null then coalesce(nullif(trim(application.application_profile ->> 'photo'), ''), profile.avatar_url)
      else profile.avatar_url
    end,
    application.phone is not null,
    case
      when requester_gender = 'Male'
        and application.phone is not null
        and presence.show_last_seen
        and presence.last_seen_at > timestamptz '2000-01-01'
        then presence.last_seen_at
      else null
    end
  from (
    select c.*, c.host_phone = input_phone as incoming
    from public.call_sessions c
    where input_phone in (c.caller_phone, c.host_phone)
      and c.status in ('ended', 'missed', 'rejected', 'cancelled')
    order by c.created_at desc
    limit least(greatest(coalesce(input_limit, 50), 1), 100)
  ) recent
  join public.phone_profiles profile
    on profile.phone = case when recent.incoming then recent.caller_phone else recent.host_phone end
  left join public.host_applications application
    on application.phone = profile.phone and application.status = 'approved'
  left join public.phone_host_presence presence
    on presence.host_phone = profile.phone
  order by recent.created_at desc;
end;
$$;

revoke all on function public.get_phone_call_history(text, integer)
  from public, anon, authenticated;
grant execute on function public.get_phone_call_history(text, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
