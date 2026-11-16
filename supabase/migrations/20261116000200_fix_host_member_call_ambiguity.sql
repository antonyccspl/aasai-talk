begin;

create or replace function public.start_host_member_call(
  input_member_phone text,
  input_call_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_digits text;
  host_phone_value text;
  session_row public.call_sessions;
  application jsonb;
  preference_enabled boolean;
  available_coins numeric(12, 1);
  first_minute_cost numeric(12, 1);
begin
  if input_member_phone is null or input_member_phone !~ '^[+]91[0-9]{10}$'
     or input_call_type not in ('audio', 'video') then
    raise exception 'Invalid call request';
  end if;

  verified_digits := pg_catalog.regexp_replace(
    coalesce(auth.jwt() ->> 'phone', ''),
    '[^0-9]',
    '',
    'g'
  );
  if length(verified_digits) = 10 then
    verified_digits := '91' || verified_digits;
  end if;
  if verified_digits !~ '^91[0-9]{10}$' then
    raise exception 'An approved Host account is required';
  end if;
  host_phone_value := '+' || verified_digits;
  if not public.phone_auth_matches(host_phone_value) then
    raise exception 'Phone identity must match the verified session';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(least(host_phone_value, input_member_phone), 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(host_phone_value, input_member_phone), 0));

  select host.application_profile,
         case input_call_type
           when 'audio' then coalesce(presence.accepting_audio_calls, true)
           when 'video' then coalesce(presence.accepting_video_calls, true)
         end
    into application, preference_enabled
  from public.phone_profiles profile
  join public.host_applications host on host.phone = profile.phone
  left join public.phone_host_presence presence on presence.host_phone = host.phone
  where profile.phone = host_phone_value
    and profile.gender = 'Female'
    and host.status = 'approved';
  if not found then raise exception 'An approved Host account is required'; end if;
  if not preference_enabled
     or not coalesce((application ->> input_call_type)::boolean, false) then
    raise exception 'This Host does not accept % calls', input_call_type;
  end if;
  if not public.phone_host_is_online(host_phone_value) then
    raise exception 'Host is offline';
  end if;

  if not exists (
    select 1
    from public.phone_identities identity
    join public.phone_profiles member on member.phone = identity.phone
    left join public.phone_user_admin_status account on account.phone = member.phone
    where identity.phone = input_member_phone
      and identity.profile_complete
      and member.gender = 'Male'
      and extract(year from age(current_date, member.date_of_birth)) between 18 and 120
      and coalesce(account.status, 'active') = 'active'
  ) then
    raise exception 'This member is unavailable';
  end if;
  if not public.phone_member_is_online(input_member_phone) then
    raise exception 'Member is offline';
  end if;
  if exists (
    select 1 from public.phone_user_blocks block
    where (block.blocker_phone = host_phone_value and block.blocked_phone = input_member_phone)
       or (block.blocker_phone = input_member_phone and block.blocked_phone = host_phone_value)
  ) then raise exception 'Calls are unavailable for this connection'; end if;

  update public.call_sessions as call
  set status = 'missed', ended_at = now(), duration_seconds = 0
  where call.status = 'ringing'
    and call.created_at < now() - interval '60 seconds'
    and (call.caller_phone in (host_phone_value, input_member_phone)
      or call.host_phone in (host_phone_value, input_member_phone));

  update public.call_sessions as call
  set status = 'cancelled', ended_at = now(), duration_seconds = 0
  where call.initiator_phone = host_phone_value and call.status = 'ringing';

  if exists (
    select 1 from public.call_sessions as call
    where (call.caller_phone in (host_phone_value, input_member_phone)
       or call.host_phone in (host_phone_value, input_member_phone))
      and call.status in ('ringing', 'connected')
  ) then raise exception 'You or this member is already on a call'; end if;

  first_minute_cost := case input_call_type when 'video' then 40.0 else 20.0 end;
  select coalesce(wallet.coins, 0) into available_coins
  from public.phone_wallets wallet
  where wallet.phone = input_member_phone;
  if coalesce(available_coins, 0) < first_minute_cost then
    raise exception 'This member does not have enough coins for the first call minute';
  end if;

  insert into public.call_sessions (
    caller_phone, host_phone, initiator_phone, call_type, status, room_id
  )
  values (
    input_member_phone, host_phone_value, host_phone_value, input_call_type, 'ringing',
    'aasai-' || replace(gen_random_uuid()::text, '-', '')
  )
  returning * into session_row;
  return jsonb_build_object('id', session_row.id, 'room_id', session_row.room_id,
    'status', session_row.status, 'call_type', session_row.call_type);
end;
$$;

revoke all on function public.start_host_member_call(text, text)
  from public, anon, authenticated;
grant execute on function public.start_host_member_call(text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
