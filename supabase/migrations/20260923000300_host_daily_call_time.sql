begin;

create or replace function public.get_host_daily_call_time(input_phone text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'seconds',
    coalesce(sum(
      case
        when c.status = 'connected'
          then greatest(0, floor(extract(epoch from now() - c.connected_at))::integer)
        else c.duration_seconds
      end
    ), 0),
    'calls',
    count(*) filter (where c.status in ('connected', 'ended')),
    'date',
    current_date
  )
  from public.call_sessions c
  where c.host_phone = input_phone
    and c.connected_at >= current_date
    and c.status in ('connected', 'ended');
$$;

revoke all on function public.get_host_daily_call_time(text) from public;
grant execute on function public.get_host_daily_call_time(text) to anon, authenticated;

commit;
