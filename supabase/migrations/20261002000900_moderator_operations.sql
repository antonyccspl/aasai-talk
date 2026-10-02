begin;

create table if not exists public.moderator_audit_log (
  id bigint generated always as identity primary key,
  actor_uid text not null,
  report_id text not null,
  action text not null,
  previous_status text not null,
  new_status text not null,
  resolution_note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.moderator_audit_log enable row level security;
revoke all on public.moderator_audit_log from public, anon, authenticated;
grant all on public.moderator_audit_log to service_role;

create or replace function public.get_moderator_ops_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with call_days as (
    select
      (created_at at time zone 'UTC')::date as day,
      count(*)::integer as total,
      count(*) filter (where status = 'ended')::integer as completed,
      count(*) filter (where status in ('missed', 'rejected', 'cancelled'))::integer as failed
    from public.call_sessions
    where created_at >= now() - interval '7 days'
    group by 1
  ), days as (
    select generate_series(current_date - 6, current_date, interval '1 day')::date as day
  ), calls as (
    select
      count(*)::integer as total,
      count(*) filter (where status = 'ended')::integer as completed,
      count(*) filter (where status in ('missed', 'rejected', 'cancelled'))::integer as failed,
      count(*) filter (where status = 'ringing')::integer as ringing,
      count(*) filter (where status = 'connected')::integer as connected
    from public.call_sessions
    where created_at >= now() - interval '7 days'
  ), reports as (
    select
      count(*) filter (where status in ('Open', 'Under review'))::integer as open,
      count(*) filter (
        where status in ('Open', 'Under review')
          and lower(reason || ' ' || details) like any (array['%abusive%', '%sexual%', '%threat%', '%unsafe%', '%scam%'])
      )::integer as priority
    from public.safety_reports
  ), hosts as (
    select
      count(*)::integer as approved,
      count(*) filter (where presence.last_seen_at >= now() - interval '60 seconds')::integer as online
    from public.host_applications application
    left join public.phone_host_presence presence on presence.host_phone = application.phone
    where application.status = 'approved'
  )
  select jsonb_build_object(
    'period_days', 7,
    'calls_total', calls.total,
    'calls_completed', calls.completed,
    'calls_failed', calls.failed,
    'calls_ringing', calls.ringing,
    'calls_connected', calls.connected,
    'completion_rate', coalesce(round(calls.completed::numeric * 100 / nullif(calls.total, 0), 1), 0),
    'reports_open', reports.open,
    'reports_priority', reports.priority,
    'hosts_approved', hosts.approved,
    'hosts_online', hosts.online,
    'daily_calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', days.day,
        'total', coalesce(call_days.total, 0),
        'completed', coalesce(call_days.completed, 0),
        'failed', coalesce(call_days.failed, 0)
      ) order by days.day)
      from days left join call_days using (day)
    ), '[]'::jsonb)
  )
  from calls, reports, hosts;
$$;

create or replace function public.moderator_resolve_safety_report(
  input_report_id text,
  input_actor_uid text,
  input_status text,
  input_resolution_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_report public.safety_reports;
  updated_report public.safety_reports;
begin
  if input_report_id is null or input_actor_uid is null or input_actor_uid = ''
     or input_status not in ('Open', 'Under review', 'Resolved', 'Rejected')
     or length(coalesce(input_resolution_note, '')) > 2000 then
    raise exception 'Invalid moderation update';
  end if;

  select * into previous_report
  from public.safety_reports
  where id::text = input_report_id
  for update;
  if not found then raise exception 'Safety report not found'; end if;

  update public.safety_reports
  set status = input_status,
      resolution_note = coalesce(input_resolution_note, '')
  where id::text = input_report_id
  returning * into updated_report;

  insert into public.moderator_audit_log(
    actor_uid, report_id, action, previous_status, new_status, resolution_note
  ) values (
    input_actor_uid, input_report_id, 'report_status_changed',
    previous_report.status, updated_report.status, coalesce(input_resolution_note, '')
  );

  return jsonb_build_object(
    'id', updated_report.id::text,
    'status', updated_report.status,
    'resolution_note', updated_report.resolution_note
  );
end;
$$;

revoke all on function public.get_moderator_ops_summary() from public, anon, authenticated;
grant execute on function public.get_moderator_ops_summary() to service_role;
revoke all on function public.moderator_resolve_safety_report(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.moderator_resolve_safety_report(text, text, text, text)
  to service_role;

commit;