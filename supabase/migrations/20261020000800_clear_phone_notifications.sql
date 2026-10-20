begin;

create table if not exists public.phone_dismissed_announcements (
  host_phone text not null
    references public.phone_identities(phone) on delete cascade,
  announcement_id uuid not null
    references public.announcements(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (host_phone, announcement_id)
);

alter table public.phone_dismissed_announcements enable row level security;
revoke all on public.phone_dismissed_announcements from public, anon, authenticated;
grant all on public.phone_dismissed_announcements to service_role;

alter table public.phone_host_payout_notifications
  add column if not exists dismissed_at timestamptz;

create or replace function public.get_phone_host_payout_notifications(input_phone text)
returns table (
  id uuid,
  withdrawal_id uuid,
  amount_paise bigint,
  status text,
  review_note text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  return query
  select notification.id,
         notification.withdrawal_id,
         notification.amount_paise,
         notification.status,
         notification.review_note,
         notification.created_at,
         notification.read_at
  from public.phone_host_payout_notifications notification
  where notification.host_phone = input_phone
    and notification.dismissed_at is null
  order by notification.created_at desc
  limit 50;
end;
$$;

create or replace function public.get_phone_dismissed_announcement_ids(input_phone text)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  return coalesce(
    array(
      select dismissed.announcement_id
      from public.phone_dismissed_announcements dismissed
      where dismissed.host_phone = input_phone
    ),
    array[]::uuid[]
  );
end;
$$;

create or replace function public.clear_phone_notifications(input_phone text)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  update public.phone_messages message
  set read_at = coalesce(message.read_at, now())
  where message.recipient_phone = input_phone
    and message.read_at is null
    and not exists (
      select 1
      from public.phone_user_blocks block
      where (block.blocker_phone = input_phone and block.blocked_phone = message.sender_phone)
         or (block.blocker_phone = message.sender_phone and block.blocked_phone = input_phone)
    );

  update public.call_sessions
  set host_notification_read_at = coalesce(host_notification_read_at, now())
  where host_phone = input_phone
    and status in ('missed', 'rejected')
    and host_notification_read_at is null;

  update public.phone_host_payout_notifications
  set read_at = coalesce(read_at, now()),
      dismissed_at = coalesce(dismissed_at, now())
  where host_phone = input_phone
    and dismissed_at is null;

  insert into public.phone_dismissed_announcements(host_phone, announcement_id)
  select input_phone, announcement.id
  from public.announcements announcement
  where announcement.is_active
  on conflict (host_phone, announcement_id) do nothing;

  return public.get_phone_dismissed_announcement_ids(input_phone);
end;
$$;

revoke all on function public.get_phone_dismissed_announcement_ids(text)
  from public;
revoke all on function public.clear_phone_notifications(text)
  from public;
revoke all on function public.get_phone_host_payout_notifications(text)
  from public;
grant execute on function public.get_phone_dismissed_announcement_ids(text)
  to anon, authenticated;
grant execute on function public.clear_phone_notifications(text)
  to anon, authenticated;
grant execute on function public.get_phone_host_payout_notifications(text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
