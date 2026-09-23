begin;

create or replace function public.get_host_daily_call_summary(input_phone text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', days.day,
    'seconds',
      coalesce((
        select sum(duration_seconds)
        from public.host_call_time_ledger l
        where l.host_phone = input_phone
          and l.call_date = days.day
      ), 0)
      + case when days.day = current_date then coalesce((
        select sum(greatest(0, floor(extract(epoch from now() - c.connected_at))::integer))
        from public.call_sessions c
        where c.host_phone = input_phone
          and c.status = 'connected'
          and c.connected_at::date = days.day
      ), 0) else 0 end,
    'calls',
      coalesce((
        select count(*)
        from public.host_call_time_ledger l
        where l.host_phone = input_phone
          and l.call_date = days.day
      ), 0)
      + case when days.day = current_date then (
        select count(*)
        from public.call_sessions c
        where c.host_phone = input_phone
          and c.status = 'connected'
          and c.connected_at::date = days.day
      ) else 0 end
  ) order by days.day desc), '[]'::jsonb)
  from generate_series(current_date - 29, current_date, interval '1 day') days(day);
$$;

revoke all on function public.get_host_daily_call_summary(text) from public;
grant execute on function public.get_host_daily_call_summary(text) to anon, authenticated;

commit;
