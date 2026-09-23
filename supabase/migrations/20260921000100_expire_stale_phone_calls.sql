begin;

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
begin
  if input_caller_phone is null or input_host_phone is null
     or input_caller_phone = input_host_phone
     or input_caller_phone !~ '^\+91[0-9]{10}$'
     or input_host_phone !~ '^\+91[0-9]{10}$'
     or input_call_type not in ('audio', 'video') then
    raise exception 'Invalid call request';
  end if;

  if not exists (
    select 1
    from public.phone_identities i
    left join public.phone_profiles p on p.phone = i.phone
    where i.phone = input_caller_phone
      and i.profile_complete
      and coalesce(p.gender, i.profile ->> 'gender') = 'Male'
  ) then
    raise exception 'Only male users can start Host calls';
  end if;

  if not exists (
    select 1
    from public.phone_profiles p
    join public.host_applications h on h.phone = p.phone
    where p.phone = input_host_phone
      and p.gender = 'Female'
      and h.status = 'approved'
  ) then
    raise exception 'The selected user is not an approved Host';
  end if;

  update public.call_sessions
  set status = 'cancelled',
      ended_at = now()
  where (caller_phone = input_caller_phone or host_phone = input_caller_phone)
    and status = 'ringing'
    and created_at < now() - interval '2 minutes';

  if exists (
    select 1 from public.call_sessions
    where (caller_phone = input_caller_phone or host_phone = input_caller_phone)
      and status in ('ringing', 'connected')
  ) then
    raise exception 'You already have an active call';
  end if;

  insert into public.call_sessions (
    caller_phone, host_phone, call_type, status, room_id
  )
  values (
    input_caller_phone, input_host_phone, input_call_type, 'ringing',
    'aasai-' || replace(gen_random_uuid()::text, '-', '')
  )
  returning * into session_row;

  return jsonb_build_object(
    'id', session_row.id,
    'room_id', session_row.room_id,
    'status', session_row.status,
    'call_type', session_row.call_type
  );
end;
$$;

commit;
