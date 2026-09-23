begin;

-- Both participants need one authoritative post-call receipt. The amount is
-- the sum of prepaid minute debits plus any final settlement debit, never a
-- client-side audio/video fallback calculation.
create or replace function public.get_phone_call_summary(
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
  total_coins bigint;
begin
  select * into call_row
  from public.call_sessions
  where id = input_session_id
    and input_phone in (caller_phone, host_phone);
  if not found then
    raise exception 'Call session not found';
  end if;

  select coalesce(sum(charged), 0)::bigint into total_coins
  from (
    select -coin_delta as charged
    from public.phone_call_minute_ledger
    where call_session_id = input_session_id and phone = call_row.caller_phone
    union all
    select -coin_delta as charged
    from public.phone_wallet_ledger
    where call_session_id = input_session_id and phone = call_row.caller_phone
  ) charges;

  return jsonb_build_object(
    'id', call_row.id,
    'call_type', call_row.call_type,
    'status', call_row.status,
    'duration_seconds', call_row.duration_seconds,
    'coins_charged', total_coins,
    'connected', call_row.connected_at is not null
  );
end;
$$;

revoke all on function public.get_phone_call_summary(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_phone_call_summary(uuid, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
