begin;

create or replace function public.get_incoming_phone_call(input_phone text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', call.id,
    'caller_phone', call.caller_phone,
    'caller_name', coalesce(
      nullif(trim(caller.display_name), ''),
      nullif(caller.username, ''),
      'Aasai Talk member'
    ),
    'call_type', call.call_type,
    'room_id', call.room_id
  )
  from public.call_sessions call
  left join public.phone_profiles caller on caller.phone = call.caller_phone
  where call.host_phone = input_phone
    and call.status = 'ringing'
    and call.created_at >= now() - interval '60 seconds'
    and not exists (
      select 1
      from public.phone_user_blocks block
      where (block.blocker_phone = call.host_phone and block.blocked_phone = call.caller_phone)
         or (block.blocker_phone = call.caller_phone and block.blocked_phone = call.host_phone)
    )
  order by call.created_at desc
  limit 1;
$$;

revoke all on function public.get_incoming_phone_call(text)
  from public, anon, authenticated;
grant execute on function public.get_incoming_phone_call(text)
  to anon, authenticated;

commit;
