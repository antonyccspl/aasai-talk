begin;

create or replace function public.get_phone_host_dashboard(input_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone is null or length(input_phone) <> 13
    or left(input_phone, 3) <> '+91'
    or substring(input_phone from 4) !~ '^[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  return jsonb_build_object(
    'today_calls', (
      select count(*) from public.host_call_time_ledger
      where host_phone = input_phone and call_date = current_date
    ) + (
      select count(*) from public.call_sessions
      where host_phone = input_phone and status = 'connected' and connected_at >= current_date
    ),
    'today_seconds', coalesce((
      select sum(duration_seconds) from public.host_call_time_ledger
      where host_phone = input_phone and call_date = current_date
    ), 0) + coalesce((
      select sum(greatest(0, floor(extract(epoch from now() - connected_at))::integer))
      from public.call_sessions
      where host_phone = input_phone and status = 'connected' and connected_at >= current_date
    ), 0),
    'today_earnings_paise', coalesce((
      select sum(earnings_paise) from public.phone_host_earnings_ledger
      where host_phone = input_phone and created_at >= current_date
    ), 0),
    'total_calls', (
      select count(*) from public.host_call_time_ledger where host_phone = input_phone
    ),
    'total_earnings_paise', coalesce((
      select earnings_paise from public.phone_wallets where phone = input_phone
    ), 0),
    'active_calls', (
      select count(*) from public.call_sessions where host_phone = input_phone and status = 'connected'
    ),
    'missed_calls', (
      select count(*) from public.call_sessions where host_phone = input_phone and status in ('missed', 'rejected')
    ),
    'recent_calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'caller_username', coalesce(nullif(caller.username, ''), 'member_' || substr(md5(recent.caller_phone), 1, 8)),
        'call_type', recent.call_type,
        'status', recent.status,
        'duration_seconds', recent.duration_seconds,
        'created_at', recent.created_at
      ) order by recent.created_at desc)
      from (
        select id, caller_phone, call_type, status, duration_seconds, created_at
        from public.call_sessions
        where host_phone = input_phone and status in ('ended', 'missed', 'rejected')
        order by created_at desc
        limit 5
      ) recent
      left join public.phone_profiles caller on caller.phone = recent.caller_phone
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_phone_host_dashboard(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_host_dashboard(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;