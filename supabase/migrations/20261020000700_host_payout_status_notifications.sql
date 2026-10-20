begin;

alter table public.phone_host_payout_notifications
  add column if not exists status text not null default 'completed',
  add column if not exists review_note text;

alter table public.phone_host_payout_notifications
  drop constraint if exists phone_host_payout_notifications_withdrawal_id_key;

alter table public.phone_host_payout_notifications
  drop constraint if exists phone_host_payout_notifications_status_check;

alter table public.phone_host_payout_notifications
  add constraint phone_host_payout_notifications_status_check
    check (status in ('pending', 'in_review', 'processing', 'completed', 'rejected', 'failed')),
  add constraint phone_host_payout_notifications_withdrawal_status_key
    unique (withdrawal_id, status);

create or replace function public.notify_host_of_completed_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_changed boolean;
begin
  if tg_op = 'INSERT' then
    status_changed := true;
  else
    status_changed := old.status is distinct from new.status;
  end if;

  if status_changed then
    insert into public.phone_host_payout_notifications(
      withdrawal_id,
      host_phone,
      amount_paise,
      status,
      review_note,
      created_at
    )
    values (
      new.id,
      new.host_phone,
      new.amount_paise,
      new.status,
      new.review_note,
      coalesce(new.updated_at, new.created_at, now())
    )
    on conflict (withdrawal_id, status) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists phone_host_withdrawal_completed_notification
  on public.phone_host_withdrawals;

create trigger phone_host_withdrawal_completed_notification
after insert or update of status on public.phone_host_withdrawals
for each row
execute function public.notify_host_of_completed_withdrawal();

insert into public.phone_host_payout_notifications(
  withdrawal_id,
  host_phone,
  amount_paise,
  status,
  review_note,
  created_at
)
select withdrawal.id,
       withdrawal.host_phone,
       withdrawal.amount_paise,
       withdrawal.status,
       withdrawal.review_note,
       coalesce(withdrawal.updated_at, withdrawal.created_at, now())
from public.phone_host_withdrawals withdrawal
where withdrawal.status in ('in_review', 'processing', 'completed', 'rejected', 'failed')
on conflict (withdrawal_id, status) do nothing;

drop function if exists public.get_phone_host_payout_notifications(text);

create function public.get_phone_host_payout_notifications(input_phone text)
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
  order by notification.created_at desc
  limit 50;
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
