begin;

alter table public.call_sessions
  add column if not exists initiator_phone text
    references public.phone_identities(phone);

update public.call_sessions
set initiator_phone = caller_phone
where initiator_phone is null;

alter table public.call_sessions
  alter column initiator_phone set not null,
  add constraint call_sessions_initiator_participant_check
    check (initiator_phone in (caller_phone, host_phone));

create index if not exists call_sessions_initiator_status_created_idx
  on public.call_sessions(initiator_phone, status, created_at desc);

create or replace function public.set_phone_call_default_initiator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.initiator_phone is null then
    new.initiator_phone := new.caller_phone;
  end if;
  return new;
end;
$$;

create trigger set_phone_call_default_initiator
before insert on public.call_sessions
for each row execute function public.set_phone_call_default_initiator();

revoke all on function public.set_phone_call_default_initiator()
  from public, anon, authenticated;

create or replace function public.phone_auth_matches(input_phone text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  verified_digits text;
  input_digits text;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;
  if auth.uid() is null or input_phone is null then
    return false;
  end if;

  verified_digits := pg_catalog.regexp_replace(
    coalesce(auth.jwt() ->> 'phone', ''),
    '[^0-9]',
    '',
    'g'
  );
  input_digits := pg_catalog.regexp_replace(input_phone, '[^0-9]', '', 'g');
  if length(verified_digits) = 10 then
    verified_digits := '91' || verified_digits;
  end if;
  if length(input_digits) = 10 then
    input_digits := '91' || input_digits;
  end if;
  return verified_digits ~ '^91[0-9]{10}$'
    and verified_digits = input_digits;
end;
$$;

revoke all on function public.phone_auth_matches(text)
  from public, anon, authenticated;
grant execute on function public.phone_auth_matches(text)
  to authenticated, service_role;

create or replace function public.phone_member_is_online(input_member_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.phone_user_presence presence
    where presence.phone = input_member_phone
      and presence.last_seen_at > now() - interval '60 seconds'
  );
$$;

revoke all on function public.phone_member_is_online(text)
  from public, anon, authenticated;
grant execute on function public.phone_member_is_online(text)
  to service_role;

create or replace function public.get_host_online_male_members()
returns table (
  member_phone text,
  username text,
  availability text,
  available_coins numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_digits text;
  viewer_phone text;
begin
  verified_digits := pg_catalog.regexp_replace(
    coalesce(auth.jwt() ->> 'phone', ''),
    '[^0-9]',
    '',
    'g'
  );
  if length(verified_digits) = 10 then
    verified_digits := '91' || verified_digits;
  end if;
  if verified_digits !~ '^91[0-9]{10}$' then
    raise exception 'An approved Host account is required';
  end if;

  viewer_phone := '+' || verified_digits;
  if not public.phone_auth_matches(viewer_phone)
     or not exists (
       select 1
       from public.phone_profiles host_profile
       join public.host_applications application
         on application.phone = host_profile.phone
        and application.status = 'approved'
       where host_profile.phone = viewer_phone
         and host_profile.gender = 'Female'
     ) then
    raise exception 'An approved Host account is required';
  end if;

  return query
  select
    profile.phone,
    coalesce(
      nullif(profile.username, ''),
      'member_' || substr(md5(profile.phone), 1, 8)
    ),
    case when exists (
      select 1
      from public.call_sessions call
      where profile.phone in (call.caller_phone, call.host_phone)
        and (
          call.status = 'connected'
          or (
            call.status = 'ringing'
            and call.created_at >= now() - interval '60 seconds'
          )
        )
    ) then 'Busy' else 'Available' end,
    coalesce(wallet.coins, 0)::numeric(12, 1)
  from public.phone_user_presence presence
  join public.phone_profiles profile on profile.phone = presence.phone
  join public.phone_identities identity
    on identity.phone = profile.phone and identity.profile_complete
  left join public.phone_user_admin_status account
    on account.phone = profile.phone
  left join public.phone_wallets wallet on wallet.phone = profile.phone
  where profile.gender = 'Male'
    and extract(year from age(current_date, profile.date_of_birth))
      between 18 and 120
    and presence.last_seen_at > now() - interval '60 seconds'
    and coalesce(account.status, 'active') = 'active'
    and not exists (
      select 1
      from public.phone_user_blocks block
      where (block.blocker_phone = viewer_phone and block.blocked_phone = profile.phone)
         or (block.blocker_phone = profile.phone and block.blocked_phone = viewer_phone)
    )
  order by presence.last_seen_at desc, profile.username asc;
end;
$$;

revoke all on function public.get_host_online_male_members()
  from public, anon, authenticated;
grant execute on function public.get_host_online_male_members()
  to authenticated, service_role;

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
  available_coins numeric(12, 1);
  first_minute_cost numeric(12, 1);
begin
  if input_caller_phone is null or input_host_phone is null
     or input_caller_phone = input_host_phone
     or input_caller_phone !~ '^[+]91[0-9]{10}$'
     or input_host_phone !~ '^[+]91[0-9]{10}$'
     or input_call_type not in ('audio', 'video') then
    raise exception 'Invalid call request';
  end if;
  if not public.phone_auth_matches(input_caller_phone) then
    raise exception 'Phone identity must match the verified session';
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

  perform pg_advisory_xact_lock(hashtextextended(least(input_caller_phone, input_host_phone), 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(input_caller_phone, input_host_phone), 0));

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
  if not public.phone_host_is_online(input_host_phone) then
    raise exception 'Host is offline';
  end if;

  update public.call_sessions
  set status = 'missed', ended_at = now(), duration_seconds = 0
  where status = 'ringing'
    and created_at < now() - interval '60 seconds'
    and (caller_phone in (input_caller_phone, input_host_phone)
      or host_phone in (input_caller_phone, input_host_phone));

  update public.call_sessions
  set status = 'cancelled', ended_at = now(), duration_seconds = 0
  where initiator_phone = input_caller_phone and status = 'ringing';

  if exists (
    select 1 from public.call_sessions
    where (caller_phone in (input_caller_phone, input_host_phone)
       or host_phone in (input_caller_phone, input_host_phone))
      and status in ('ringing', 'connected')
  ) then raise exception 'You or the selected user is already on a call'; end if;

  first_minute_cost := case input_call_type when 'video' then 40.0 else 20.0 end;
  select coalesce(wallet.coins, 0) into available_coins
  from public.phone_wallets wallet
  where wallet.phone = input_caller_phone;
  if coalesce(available_coins, 0) < first_minute_cost then
    raise exception 'Insufficient coins for the first call minute';
  end if;

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
  to authenticated, service_role;

create or replace function public.start_host_member_call(
  input_member_phone text,
  input_call_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_digits text;
  host_phone text;
  session_row public.call_sessions;
  application jsonb;
  preference_enabled boolean;
  available_coins numeric(12, 1);
  first_minute_cost numeric(12, 1);
begin
  if input_member_phone is null or input_member_phone !~ '^[+]91[0-9]{10}$'
     or input_call_type not in ('audio', 'video') then
    raise exception 'Invalid call request';
  end if;

  verified_digits := pg_catalog.regexp_replace(
    coalesce(auth.jwt() ->> 'phone', ''),
    '[^0-9]',
    '',
    'g'
  );
  if length(verified_digits) = 10 then
    verified_digits := '91' || verified_digits;
  end if;
  if verified_digits !~ '^91[0-9]{10}$' then
    raise exception 'An approved Host account is required';
  end if;
  host_phone := '+' || verified_digits;
  if not public.phone_auth_matches(host_phone) then
    raise exception 'Phone identity must match the verified session';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(least(host_phone, input_member_phone), 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(host_phone, input_member_phone), 0));

  select host.application_profile,
         case input_call_type
           when 'audio' then coalesce(presence.accepting_audio_calls, true)
           when 'video' then coalesce(presence.accepting_video_calls, true)
         end
    into application, preference_enabled
  from public.phone_profiles profile
  join public.host_applications host on host.phone = profile.phone
  left join public.phone_host_presence presence on presence.host_phone = host.phone
  where profile.phone = host_phone
    and profile.gender = 'Female'
    and host.status = 'approved';
  if not found then raise exception 'An approved Host account is required'; end if;
  if not preference_enabled
     or not coalesce((application ->> input_call_type)::boolean, false) then
    raise exception 'This Host does not accept % calls', input_call_type;
  end if;
  if not public.phone_host_is_online(host_phone) then
    raise exception 'Host is offline';
  end if;

  if not exists (
    select 1
    from public.phone_identities identity
    join public.phone_profiles member on member.phone = identity.phone
    left join public.phone_user_admin_status account on account.phone = member.phone
    where identity.phone = input_member_phone
      and identity.profile_complete
      and member.gender = 'Male'
      and extract(year from age(current_date, member.date_of_birth)) between 18 and 120
      and coalesce(account.status, 'active') = 'active'
  ) then
    raise exception 'This member is unavailable';
  end if;
  if not public.phone_member_is_online(input_member_phone) then
    raise exception 'Member is offline';
  end if;
  if exists (
    select 1 from public.phone_user_blocks block
    where (block.blocker_phone = host_phone and block.blocked_phone = input_member_phone)
       or (block.blocker_phone = input_member_phone and block.blocked_phone = host_phone)
  ) then raise exception 'Calls are unavailable for this connection'; end if;

  update public.call_sessions as call
  set status = 'missed', ended_at = now(), duration_seconds = 0
  where call.status = 'ringing'
    and call.created_at < now() - interval '60 seconds'
    and (call.caller_phone in (host_phone, input_member_phone)
      or call.host_phone in (host_phone, input_member_phone));

  update public.call_sessions as call
  set status = 'cancelled', ended_at = now(), duration_seconds = 0
  where call.initiator_phone = host_phone and call.status = 'ringing';

  if exists (
    select 1 from public.call_sessions as call
    where (call.caller_phone in (host_phone, input_member_phone)
       or call.host_phone in (host_phone, input_member_phone))
      and call.status in ('ringing', 'connected')
  ) then raise exception 'You or this member is already on a call'; end if;

  first_minute_cost := case input_call_type when 'video' then 40.0 else 20.0 end;
  select coalesce(wallet.coins, 0) into available_coins
  from public.phone_wallets wallet
  where wallet.phone = input_member_phone;
  if coalesce(available_coins, 0) < first_minute_cost then
    raise exception 'This member does not have enough coins for the first call minute';
  end if;

  insert into public.call_sessions (
    caller_phone, host_phone, initiator_phone, call_type, status, room_id
  )
  values (
    input_member_phone, host_phone, host_phone, input_call_type, 'ringing',
    'aasai-' || replace(gen_random_uuid()::text, '-', '')
  )
  returning * into session_row;
  return jsonb_build_object('id', session_row.id, 'room_id', session_row.room_id,
    'status', session_row.status, 'call_type', session_row.call_type);
end;
$$;

revoke all on function public.start_host_member_call(text, text)
  from public, anon, authenticated;
grant execute on function public.start_host_member_call(text, text)
  to authenticated, service_role;

create or replace function public.get_incoming_phone_call(input_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming_call jsonb;
begin
  if not public.phone_auth_matches(input_phone) then
    raise exception 'Phone identity must match the verified session';
  end if;

  select jsonb_build_object(
    'id', call.id,
    'caller_phone', call.initiator_phone,
    'caller_name', coalesce(
      nullif(trim(host.application_profile ->> 'name'), ''),
      nullif(trim(caller.display_name), ''),
      nullif(caller.username, ''),
      'Aasai Talk member'
    ),
    'call_type', call.call_type,
    'room_id', call.room_id
  )
  into incoming_call
  from public.call_sessions call
  left join public.phone_profiles caller
    on caller.phone = call.initiator_phone
  left join public.host_applications host
    on host.phone = call.initiator_phone and host.status = 'approved'
  where case
      when call.initiator_phone = call.caller_phone then call.host_phone
      else call.caller_phone
    end = input_phone
    and call.status = 'ringing'
    and call.created_at >= now() - interval '60 seconds'
    and not exists (
      select 1 from public.phone_user_blocks block
      where (block.blocker_phone = call.host_phone and block.blocked_phone = call.caller_phone)
         or (block.blocker_phone = call.caller_phone and block.blocked_phone = call.host_phone)
    )
  order by call.created_at desc
  limit 1;
  return incoming_call;
end;
$$;

revoke all on function public.get_incoming_phone_call(text)
  from public, anon, authenticated;
grant execute on function public.get_incoming_phone_call(text)
  to authenticated, service_role;

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
  invited_phone text;
begin
  if input_status is null
     or input_status not in ('connected', 'ended', 'missed', 'rejected', 'cancelled')
     or input_duration_seconds is null
     or input_duration_seconds < 0 then
    raise exception 'Invalid call status';
  end if;
  if not public.phone_auth_matches(input_phone) then
    raise exception 'Phone identity must match the verified session';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(call.host_phone, 0))
  from public.call_sessions call
  where call.id = input_session_id;

  select * into session_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone)
  for update;
  if not found then
    raise exception 'Call session not found';
  end if;

  invited_phone := case
    when session_row.initiator_phone = session_row.caller_phone
      then session_row.host_phone
    else session_row.caller_phone
  end;

  if input_status = 'connected' then
    if input_phone <> invited_phone then
      raise exception 'Only the invited participant can accept this call';
    end if;
    if session_row.status <> 'ringing' then return; end if;
    if not public.phone_host_is_online(session_row.host_phone) then
      raise exception 'Host is offline';
    end if;
    if invited_phone = session_row.caller_phone
       and not public.phone_member_is_online(session_row.caller_phone) then
      raise exception 'Member is offline';
    end if;
    if session_row.created_at < now() - interval '60 seconds' then
      raise exception 'This call invitation has expired';
    end if;
  elsif input_status in ('missed', 'rejected', 'cancelled') then
    if session_row.status <> 'ringing' then return; end if;
    if input_status = 'rejected' and input_phone <> invited_phone then
      raise exception 'Only the invited participant can decline this call';
    end if;
    if input_status = 'cancelled' and input_phone <> session_row.initiator_phone then
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

revoke all on function public.update_phone_call(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.update_phone_call(uuid, text, text, integer)
  to authenticated, service_role;

create or replace function public.acknowledge_phone_host_call(
  input_host_phone text,
  input_call_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.phone_auth_matches(input_host_phone) then
    raise exception 'Phone identity must match the verified session';
  end if;

  update public.call_sessions call
  set host_received_at = coalesce(host_received_at, now())
  where call.id = input_call_id
    and case
      when call.initiator_phone = call.caller_phone then call.host_phone
      else call.caller_phone
    end = input_host_phone
    and call.status = 'ringing'
    and call.created_at > now() - interval '60 seconds'
    and public.phone_host_is_online(call.host_phone)
    and (
      call.initiator_phone = call.caller_phone
      or public.phone_member_is_online(call.caller_phone)
    );
  return found;
end;
$$;

revoke all on function public.acknowledge_phone_host_call(text, uuid)
  from public, anon, authenticated;
grant execute on function public.acknowledge_phone_host_call(text, uuid)
  to service_role;

create or replace function public.get_phone_call_history(
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
  requester_is_host boolean;
begin
  if input_phone is null or length(input_phone) <> 13
    or left(input_phone, 3) <> '+91'
    or substring(input_phone from 4) !~ '^[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  select profile.gender into requester_gender
  from public.phone_profiles profile
  where profile.phone = input_phone;
  select exists (
    select 1 from public.host_applications application
    where application.phone = input_phone and application.status = 'approved'
  ) into requester_is_host;

  return query
  select recent.id,
    case when recent.caller_phone = input_phone
      then recent.host_phone else recent.caller_phone end,
    recent.call_type,
    recent.status,
    recent.duration_seconds,
    recent.incoming,
    recent.created_at,
    coalesce(nullif(profile.username, ''), 'member_' || substr(md5(profile.phone), 1, 8)),
    case
      when requester_is_host and profile.gender = 'Male' then null
      when application.phone is not null then coalesce(nullif(trim(application.application_profile ->> 'name'), ''), profile.display_name)
      else profile.display_name
    end,
    case
      when requester_is_host and profile.gender = 'Male' then null
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
    select call.*,
      call.initiator_phone <> input_phone as incoming
    from public.call_sessions call
    where input_phone in (call.caller_phone, call.host_phone)
      and call.status in ('ended', 'missed', 'rejected', 'cancelled')
    order by call.created_at desc
    limit least(greatest(coalesce(input_limit, 50), 1), 100)
  ) recent
  join public.phone_profiles profile
    on profile.phone = case when recent.caller_phone = input_phone
      then recent.host_phone else recent.caller_phone end
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
  to authenticated, service_role;

update public.app_policies_and_settings
set content = coalesce((
  select jsonb_agg(
    case
      when item.value ->> 'title' = 'Online status'
        then jsonb_set(
          item.value,
          '{description}',
          to_jsonb(
            'While you use the app, we refresh a recent-activity timestamp to show your online status to authorised operations staff and approved Hosts. Approved Hosts can also see your available coin balance while you are online so they can check whether a call is affordable. We keep only the latest timestamp, not an activity history, and treat you as offline after about a minute without an update.'::text
          ),
          true
        )
      else item.value
    end
    order by item.ordinality
  )
  from jsonb_array_elements(content) with ordinality as item(value, ordinality)
), '[]'::jsonb) || case
  when content @> '[{"title":"Available coin balance"}]'::jsonb then '[]'::jsonb
  else jsonb_build_array(jsonb_build_object(
    'title', 'Available coin balance',
    'description', 'Your available coin balance is private. It is shared only with approved Hosts while you are online, so they can decide whether a call can start at the selected rate.'
  ))
end,
updated_at = now()
where key = 'privacy'
  and jsonb_typeof(content) = 'array';

notify pgrst, 'reload schema';

commit;
