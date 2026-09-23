begin;

alter table public.call_sessions
  add column if not exists video_upgrade_requested_by text references public.phone_identities(phone),
  add column if not exists video_upgrade_requested_at timestamptz;

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
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone) for update;
  if not found then raise exception 'Call session not found'; end if;
  if call_row.status <> 'connected' or call_row.call_type <> 'audio' then
    raise exception 'Only a connected audio call can request video';
  end if;
  select application_profile into application from public.host_applications
  where phone = call_row.host_phone and status = 'approved';
  if not found or not coalesce((application ->> 'video')::boolean, false) then
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

create or replace function public.accept_phone_call_video_upgrade(
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
  slab public.receiver_coin_diamond_slabs;
  daily_seconds integer;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone) for update;
  if not found then raise exception 'Call session not found'; end if;
  if call_row.status <> 'connected' or call_row.call_type <> 'audio'
     or call_row.video_upgrade_requested_by is null then
    raise exception 'There is no pending video upgrade request';
  end if;
  if input_phone = call_row.video_upgrade_requested_by then
    raise exception 'The other participant must accept the video request';
  end if;

  update public.call_sessions
  set call_type = 'video', video_upgrade_requested_by = null, video_upgrade_requested_at = null
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
  return jsonb_build_object('call_type', 'video',
    'coins_per_minute', ceil(slab.diamonds_per_minute * slab.coins_per_diamond)::bigint);
end;
$$;

create or replace function public.get_phone_call_state(input_session_id uuid, input_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare call_row public.call_sessions;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone);
  if not found then raise exception 'Call session not found'; end if;
  return jsonb_build_object('status', call_row.status, 'call_type', call_row.call_type,
    'video_upgrade_requested_by', call_row.video_upgrade_requested_by);
end;
$$;

revoke all on function public.request_phone_call_video_upgrade(uuid, text), public.accept_phone_call_video_upgrade(uuid, text) from public, anon, authenticated;
grant execute on function public.request_phone_call_video_upgrade(uuid, text), public.accept_phone_call_video_upgrade(uuid, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
