begin;

-- Settle the caller wallet and Host earnings on the server whenever either
-- participant ends a connected call. This removes the dependency on the
-- caller's browser remaining open long enough to run a separate settlement RPC.
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

commit;
