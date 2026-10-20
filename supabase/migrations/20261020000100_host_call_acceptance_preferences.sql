begin;

alter table public.phone_host_presence
  add column if not exists accepting_audio_calls boolean not null default true,
  add column if not exists accepting_video_calls boolean not null default true;

create or replace function public.get_phone_host_call_capabilities(input_host_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  application jsonb;
  audio_enabled boolean;
  video_enabled boolean;
begin
  select host.application_profile,
         coalesce(presence.accepting_audio_calls, true),
         coalesce(presence.accepting_video_calls, true)
    into application, audio_enabled, video_enabled
  from public.host_applications host
  left join public.phone_host_presence presence
    on presence.host_phone = host.phone
  where host.phone = input_host_phone and host.status = 'approved';
  if not found then raise exception 'The selected user is not an approved Host'; end if;

  return jsonb_build_object(
    'audio', coalesce((application ->> 'audio')::boolean, false) and audio_enabled,
    'video', coalesce((application ->> 'video')::boolean, false) and video_enabled
  );
end;
$$;

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
    select 1 from public.phone_identities identity
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

  if exists (
    select 1
    from public.phone_push_tokens device
    where device.phone = input_host_phone and device.platform = 'android'
  ) and not exists (
    select 1 from public.phone_host_presence
    where host_phone = input_host_phone and accepting_calls
  ) then raise exception 'Host is not accepting calls'; end if;

  if not exists (
    select 1
    from public.phone_host_presence presence
    where presence.host_phone = input_host_phone
      and (
        presence.last_seen_at > now() - interval '60 seconds'
        or (
          presence.accepting_calls
          and exists (
            select 1
            from public.phone_push_tokens device
            where device.phone = input_host_phone and device.platform = 'android'
          )
        )
      )
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

create or replace function public.set_phone_host_call_preference(
  input_host_phone text,
  input_call_type text,
  input_accepting boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  application jsonb;
begin
  if input_host_phone is null
     or input_host_phone !~ '^[+]91[0-9]{10}$'
     or input_call_type is null
     or input_call_type not in ('audio', 'video')
     or input_accepting is null then
    raise exception 'Invalid Host call preference';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(input_host_phone, 0));

  select host.application_profile into application
  from public.host_applications host
  where host.phone = input_host_phone and host.status = 'approved';
  if not found then raise exception 'An approved Host account is required'; end if;
  if input_accepting
     and not coalesce((application ->> input_call_type)::boolean, false) then
    raise exception 'This call type is not enabled in the approved Host profile';
  end if;

  if input_call_type = 'audio' then
    insert into public.phone_host_presence(
      host_phone, last_seen_at, accepting_audio_calls
    ) values (
      input_host_phone, timestamptz 'epoch', input_accepting
    )
    on conflict (host_phone) do update
      set accepting_audio_calls = excluded.accepting_audio_calls;
  else
    insert into public.phone_host_presence(
      host_phone, last_seen_at, accepting_video_calls
    ) values (
      input_host_phone, timestamptz 'epoch', input_accepting
    )
    on conflict (host_phone) do update
      set accepting_video_calls = excluded.accepting_video_calls;
  end if;

  if not input_accepting then
    update public.call_sessions
    set status = 'cancelled', ended_at = now(), duration_seconds = 0
    where host_phone = input_host_phone
      and status = 'ringing'
      and call_type = input_call_type;

    if input_call_type = 'video' then
      update public.call_sessions
      set video_upgrade_requested_by = null, video_upgrade_requested_at = null
      where host_phone = input_host_phone
        and status = 'connected'
        and call_type = 'audio'
        and video_upgrade_requested_by is not null;
    end if;
  end if;
end;
$$;

create or replace function public.request_phone_call_video_upgrade(
  input_session_id uuid,
  input_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.call_sessions;
  application jsonb;
  video_enabled boolean;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone);
  if not found then raise exception 'Call session not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(call_row.host_phone, 0));
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone) for update;
  if not found then raise exception 'Call session not found'; end if;
  if call_row.status <> 'connected' or call_row.call_type <> 'audio' then
    raise exception 'Only a connected audio call can request video';
  end if;
  select host.application_profile,
         coalesce(presence.accepting_video_calls, true)
    into application, video_enabled
  from public.host_applications host
  left join public.phone_host_presence presence on presence.host_phone = host.phone
  where host.phone = call_row.host_phone and host.status = 'approved';
  if not found
     or not coalesce((application ->> 'video')::boolean, false)
     or not video_enabled then
    raise exception 'This Host does not accept video calls';
  end if;
  if call_row.video_upgrade_requested_by is not null then
    raise exception 'A video upgrade request is already pending';
  end if;
  update public.call_sessions
  set video_upgrade_requested_by = input_phone, video_upgrade_requested_at = now()
  where id = input_session_id;
end;
$$;

revoke all on function public.get_phone_host_call_capabilities(text),
  public.start_phone_call(text, text, text),
  public.request_phone_call_video_upgrade(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_phone_host_call_capabilities(text),
  public.start_phone_call(text, text, text),
  public.request_phone_call_video_upgrade(uuid, text)
  to anon, authenticated;
revoke all on function public.set_phone_host_call_preference(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_phone_host_call_preference(text, text, boolean)
  to service_role;

notify pgrst, 'reload schema';

commit;
