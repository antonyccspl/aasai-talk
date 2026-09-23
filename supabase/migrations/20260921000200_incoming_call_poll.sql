begin;

create or replace function public.get_incoming_phone_call(input_phone text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'caller_phone', c.caller_phone,
    'call_type', c.call_type,
    'room_id', c.room_id
  )
  from public.call_sessions c
  where c.host_phone = input_phone
    and c.status = 'ringing'
  order by c.created_at asc
  limit 1;
$$;

revoke all on function public.get_incoming_phone_call(text)
  from public, anon, authenticated;
grant execute on function public.get_incoming_phone_call(text)
  to anon, authenticated;

commit;
