begin;

-- The caller needs the authoritative post-upgrade wallet balance to redraw the
-- remaining talk-time budget. The Host never receives this private value.
create or replace function public.get_phone_call_state(input_session_id uuid, input_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.call_sessions;
  caller_coins bigint;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone);
  if not found then raise exception 'Call session not found'; end if;
  if input_phone = call_row.caller_phone then
    select coalesce(coins, 0) into caller_coins from public.phone_wallets
    where phone = call_row.caller_phone;
  end if;
  return jsonb_build_object(
    'status', call_row.status,
    'call_type', call_row.call_type,
    'video_upgrade_requested_by', call_row.video_upgrade_requested_by,
    'remaining_coins', case when input_phone = call_row.caller_phone then caller_coins else null end
  );
end;
$$;

revoke all on function public.get_phone_call_state(uuid, text) from public, anon, authenticated;
grant execute on function public.get_phone_call_state(uuid, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
