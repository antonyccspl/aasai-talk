begin;

create or replace function public.get_phone_host_dashboard(input_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone !~ '^\+91[0-9]{10}$' then
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
      select sum(earnings_delta_paise) from public.phone_wallet_ledger
      where phone = input_phone and created_at >= current_date
    ), 0),
    'total_calls', (select count(*) from public.host_call_time_ledger where host_phone = input_phone),
    'total_earnings_paise', coalesce((
      select earnings_paise from public.phone_wallets where phone = input_phone
    ), 0),
    'active_calls', (select count(*) from public.call_sessions where host_phone = input_phone and status = 'connected'),
    'missed_calls', (select count(*) from public.call_sessions where host_phone = input_phone and status in ('missed', 'rejected')),
    'recent_calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'caller_phone', c.caller_phone, 'call_type', c.call_type,
        'status', c.status, 'duration_seconds', c.duration_seconds, 'created_at', c.created_at
      ) order by c.created_at desc)
      from (
        select * from public.call_sessions
        where host_phone = input_phone and status in ('ended', 'missed', 'rejected')
        order by created_at desc limit 5
      ) c
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_phone_host_dashboard(text) from public;
grant execute on function public.get_phone_host_dashboard(text) to anon, authenticated;

commit;
