begin;

alter table public.call_sessions
  add column if not exists host_notification_read_at timestamptz;

create index if not exists call_sessions_host_unread_notification_idx
  on public.call_sessions (host_phone, created_at desc)
  where host_notification_read_at is null and status in ('missed', 'rejected');

create or replace function public.get_phone_notification_unread_count(input_phone text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
begin
  if input_phone !~ '^\+91[0-9]{10}$' then raise exception 'Invalid phone'; end if;
  return (
    select count(*) from public.phone_messages
    where recipient_phone = input_phone and read_at is null
  ) + (
    select count(*) from public.call_sessions
    where host_phone = input_phone and status in ('missed', 'rejected')
      and host_notification_read_at is null
  );
end;
$$;

create or replace function public.mark_phone_call_notification_read(input_session_id uuid, input_phone text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if input_phone !~ '^\+91[0-9]{10}$' then raise exception 'Invalid phone'; end if;
  update public.call_sessions set host_notification_read_at = now()
  where id = input_session_id and host_phone = input_phone
    and status in ('missed', 'rejected') and host_notification_read_at is null;
  return found;
end;
$$;

create or replace function public.get_phone_call_notifications(input_phone text)
returns table (id uuid, other_phone text, call_type text, status text, created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if input_phone !~ '^\+91[0-9]{10}$' then raise exception 'Invalid phone'; end if;
  return query
  select c.id, c.caller_phone, c.call_type, c.status, c.created_at
  from public.call_sessions c
  where c.host_phone = input_phone and c.status in ('missed', 'rejected')
    and c.host_notification_read_at is null
  order by c.created_at desc limit 50;
end;
$$;

revoke all on function public.get_phone_notification_unread_count(text) from public;
revoke all on function public.mark_phone_call_notification_read(uuid, text) from public;
grant execute on function public.get_phone_notification_unread_count(text) to anon, authenticated;
grant execute on function public.mark_phone_call_notification_read(uuid, text) to anon, authenticated;
grant execute on function public.get_phone_call_notifications(text) to anon, authenticated;

commit;
