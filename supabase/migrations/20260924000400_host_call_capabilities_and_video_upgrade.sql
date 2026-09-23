begin;

-- Host call preferences are part of the approved application. Expose only the
-- two capabilities required by a caller; documents and other profile fields
-- remain private.
create or replace function public.get_phone_host_call_capabilities(input_host_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  application jsonb;
begin
  select h.application_profile into application
  from public.host_applications h
  where h.phone = input_host_phone and h.status = 'approved';
  if not found then raise exception 'The selected user is not an approved Host'; end if;

  return jsonb_build_object(
    'audio', coalesce((application ->> 'audio')::boolean, false),
    'video', coalesce((application ->> 'video')::boolean, false)
  );
end;
$$;

-- Do not let a caller request a media type that the approved Host disabled in
-- the Become a Host settings.
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
     or input_caller_phone !~ '^\+91[0-9]{10}$'
     or input_host_phone !~ '^\+91[0-9]{10}$'
     or input_call_type not in ('audio', 'video') then
    raise exception 'Invalid call request';
  end if;

  if not exists (
    select 1 from public.phone_identities i
    left join public.phone_profiles p on p.phone = i.phone
    where i.phone = input_caller_phone and i.profile_complete
      and coalesce(p.gender, i.profile ->> 'gender') = 'Male'
  ) then
    raise exception 'Only male users can start Host calls';
  end if;

  select h.application_profile into application
  from public.phone_profiles p
  join public.host_applications h on h.phone = p.phone
  where p.phone = input_host_phone and p.gender = 'Female' and h.status = 'approved';
  if not found then raise exception 'The selected user is not an approved Host'; end if;
  if not coalesce((application ->> input_call_type)::boolean, false) then
    raise exception 'This Host does not accept % calls', input_call_type;
  end if;

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

-- An upgrade changes the room media mode for both participants. The current
-- started minute has already been prepaid at its original rate; future started
-- minutes are charged using the new call_type by charge_phone_call_minute.
create or replace function public.switch_phone_call_to_video(
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
  application jsonb;
  slab public.receiver_coin_diamond_slabs;
  daily_seconds integer;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone)
  for update;
  if not found then raise exception 'Call session not found'; end if;
  if call_row.status <> 'connected' then raise exception 'Only a connected call can switch to video'; end if;

  select application_profile into application from public.host_applications
  where phone = call_row.host_phone and status = 'approved';
  if not found or not coalesce((application ->> 'video')::boolean, false) then
    raise exception 'This Host does not accept video calls';
  end if;

  update public.call_sessions set call_type = 'video'
  where id = input_session_id;

  select greatest(0, coalesce(sum(l.duration_seconds), 0))::integer into daily_seconds
  from public.host_call_time_ledger l
  where l.host_phone = call_row.host_phone and l.call_date = current_date;
  select * into slab from public.receiver_coin_diamond_slabs
  where is_active and call_type = 'VIDEO'
    and daily_seconds >= min_minutes * 60
    and (max_minutes is null or daily_seconds < max_minutes * 60)
  order by min_minutes desc limit 1;
  if not found then raise exception 'No active video receiver slab configured'; end if;

  return jsonb_build_object(
    'call_type', 'video',
    'coins_per_minute', ceil(slab.diamonds_per_minute * slab.coins_per_diamond)::bigint
  );
end;
$$;

create or replace function public.get_phone_call_state(input_session_id uuid, input_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.call_sessions;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone);
  if not found then raise exception 'Call session not found'; end if;
  return jsonb_build_object('status', call_row.status, 'call_type', call_row.call_type);
end;
$$;

revoke all on function public.get_phone_host_call_capabilities(text), public.switch_phone_call_to_video(uuid, text), public.get_phone_call_state(uuid, text) from public, anon, authenticated;
grant execute on function public.get_phone_host_call_capabilities(text), public.switch_phone_call_to_video(uuid, text), public.get_phone_call_state(uuid, text) to anon, authenticated;
revoke all on function public.start_phone_call(text, text, text) from public, anon, authenticated;
grant execute on function public.start_phone_call(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
