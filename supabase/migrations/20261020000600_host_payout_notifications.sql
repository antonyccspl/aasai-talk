begin;

create table if not exists public.phone_host_payout_notifications (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null unique
    references public.phone_host_withdrawals(id) on delete cascade,
  host_phone text not null
    references public.phone_identities(phone) on delete cascade,
  amount_paise bigint not null check (amount_paise > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists phone_host_payout_notifications_unread_idx
  on public.phone_host_payout_notifications(host_phone, created_at desc)
  where read_at is null;

alter table public.phone_host_payout_notifications enable row level security;
revoke all on public.phone_host_payout_notifications from public, anon, authenticated;
grant all on public.phone_host_payout_notifications to service_role;

create or replace function public.notify_host_of_completed_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    insert into public.phone_host_payout_notifications(
      withdrawal_id,
      host_phone,
      amount_paise
    )
    values (
      new.id,
      new.host_phone,
      new.amount_paise
    )
    on conflict (withdrawal_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger phone_host_withdrawal_completed_notification
after update of status on public.phone_host_withdrawals
for each row
execute function public.notify_host_of_completed_withdrawal();

create or replace function public.get_phone_host_payout_notifications(input_phone text)
returns table (
  id uuid,
  withdrawal_id uuid,
  amount_paise bigint,
  created_at timestamptz
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
         notification.created_at
  from public.phone_host_payout_notifications notification
  where notification.host_phone = input_phone
    and notification.read_at is null
  order by notification.created_at desc
  limit 50;
end;
$$;

create or replace function public.mark_phone_host_payout_notification_read(
  input_notification_id uuid,
  input_phone text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  update public.phone_host_payout_notifications
  set read_at = now()
  where id = input_notification_id
    and host_phone = input_phone
    and read_at is null;
  return found;
end;
$$;

create or replace function public.get_phone_notification_unread_count(input_phone text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  return (
    select count(*) from public.phone_messages
    where recipient_phone = input_phone and read_at is null
  ) + (
    select count(*) from public.call_sessions
    where host_phone = input_phone
      and status in ('missed', 'rejected')
      and host_notification_read_at is null
  ) + (
    select count(*) from public.phone_host_payout_notifications
    where host_phone = input_phone and read_at is null
  );
end;
$$;

revoke all on function public.get_phone_host_payout_notifications(text)
  from public;
revoke all on function public.mark_phone_host_payout_notification_read(uuid, text)
  from public;
revoke all on function public.get_phone_notification_unread_count(text)
  from public;
grant execute on function public.get_phone_host_payout_notifications(text)
  to anon, authenticated;
grant execute on function public.mark_phone_host_payout_notification_read(uuid, text)
  to anon, authenticated;
grant execute on function public.get_phone_notification_unread_count(text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
