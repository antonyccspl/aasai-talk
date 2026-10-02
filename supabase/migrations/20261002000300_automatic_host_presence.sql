begin;

create table if not exists public.phone_host_presence (
  host_phone text primary key references public.phone_identities(phone) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists phone_host_presence_last_seen_idx
  on public.phone_host_presence(last_seen_at desc);

alter table public.phone_host_presence enable row level security;
revoke all on public.phone_host_presence from public, anon, authenticated;
grant all on public.phone_host_presence to service_role;

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
  accent_color text
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
    case
      when jsonb_typeof(ha.application_profile -> 'languages') = 'array'
        then array(select jsonb_array_elements_text(ha.application_profile -> 'languages'))
      else pp.languages
    end,
    case
      when jsonb_typeof(ha.application_profile -> 'interests') = 'array'
        then array(select jsonb_array_elements_text(ha.application_profile -> 'interests'))
      else pp.interests
    end,
    coalesce(ha.application_profile ->> 'bio', pp.bio),
    case
      when exists (
        select 1
        from public.phone_host_presence presence
        where presence.host_phone = pp.phone
          and presence.last_seen_at > now() - interval '60 seconds'
      ) and exists (
        select 1
        from public.call_sessions call
        where call.host_phone = pp.phone
          and (
            call.status = 'connected'
            or (call.status = 'ringing' and call.created_at >= now() - interval '60 seconds')
          )
      ) then 'Busy'
      when exists (
        select 1
        from public.phone_host_presence presence
        where presence.host_phone = pp.phone
          and presence.last_seen_at > now() - interval '60 seconds'
      ) then 'Available'
      else 'Offline'
    end,
    coalesce(nullif(trim(ha.application_profile ->> 'photo'), ''), pp.avatar_url),
    '#285647'
  from public.phone_profiles pp
  join public.host_applications ha on ha.phone = pp.phone
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

  if not exists (
    select 1 from public.phone_host_presence
    where host_phone = input_host_phone
      and last_seen_at > now() - interval '60 seconds'
  ) then raise exception 'Host is offline'; end if;

  if exists (
    select 1 from public.call_sessions
    where host_phone = input_host_phone and status in ('ringing', 'connected')
  ) then raise exception 'Host is busy on another call'; end if;

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

notify pgrst, 'reload schema';
commit;