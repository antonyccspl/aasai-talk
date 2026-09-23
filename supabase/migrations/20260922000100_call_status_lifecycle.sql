begin;

-- Phone-identity prototype RPCs: do not expose call_sessions to anonymous SELECT.
-- These must be bound to a verified auth identity before production release.
create or replace function public.get_phone_call_status(input_session_id uuid, input_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  update public.call_sessions set status = 'missed', ended_at = now()
  where id = input_session_id and input_phone in (caller_phone, host_phone)
    and status = 'ringing' and created_at < now() - interval '60 seconds';
  select status into result from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone);
  if not found then raise exception 'Call session not found'; end if;
  return result;
end;
$$;
revoke all on function public.get_phone_call_status(uuid, text) from public;
grant execute on function public.get_phone_call_status(uuid, text) to anon, authenticated;

create or replace function public.get_incoming_phone_call(input_phone text)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'caller_phone', c.caller_phone,
    'call_type', c.call_type, 'room_id', c.room_id)
  from public.call_sessions c
  where c.host_phone = input_phone and c.status = 'ringing'
    and c.created_at >= now() - interval '60 seconds'
  order by c.created_at desc limit 1;
$$;

create or replace function public.update_phone_call(
  input_session_id uuid, input_phone text, input_status text,
  input_duration_seconds integer default 0
)
returns void language plpgsql security definer set search_path = '' as $$
declare session_row public.call_sessions;
begin
  if input_status is null or input_status not in ('connected', 'ended', 'missed', 'rejected', 'cancelled')
     or input_duration_seconds is null or input_duration_seconds < 0 then
    raise exception 'Invalid call status';
  end if;
  select * into session_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone) for update;
  if not found then raise exception 'Call session not found'; end if;
  if session_row.status not in ('ringing', 'connected') then return; end if;
  if input_status = 'connected' then
    if input_phone <> session_row.host_phone then raise exception 'Only the Host can accept this call'; end if;
    if session_row.status = 'ringing' and session_row.created_at < now() - interval '60 seconds' then
      raise exception 'This call invitation has expired';
    end if;
  end if;
  update public.call_sessions set status = input_status,
    connected_at = case when input_status = 'connected' then coalesce(connected_at, now()) else connected_at end,
    started_at = case when input_status = 'connected' then coalesce(started_at, now()) else started_at end,
    ended_at = case when input_status <> 'connected' then now() else ended_at end,
    duration_seconds = case when input_status <> 'connected' then
      case when connected_at is null then 0 else greatest(0, floor(extract(epoch from now() - connected_at))::integer) end
      else duration_seconds end
  where id = input_session_id;
end;
$$;
commit;
