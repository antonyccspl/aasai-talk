begin;

create or replace function public.get_phone_wallet_activity(
  input_phone text,
  input_limit integer default 50
)
returns table(
  id uuid,
  title text,
  coin_delta bigint,
  category text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with call_charges as (
    select phone, call_session_id, coin_delta, created_at
    from public.phone_call_minute_ledger

    union all

    select phone, call_session_id, coin_delta, created_at
    from public.phone_call_mode_switch_ledger

    union all

    select phone, call_session_id, coin_delta, created_at
    from public.phone_wallet_ledger
    where coin_delta <> 0
  ),
  call_activity as (
    select
      session.id,
      case session.call_type
        when 'video' then 'Video call'
        else 'Audio call'
      end::text as title,
      sum(charge.coin_delta)::bigint as coin_delta,
      'Calls'::text as category,
      case session.status
        when 'connected' then 'In progress'
        when 'ended' then 'Completed'
        when 'missed' then 'Missed'
        when 'rejected' then 'Declined'
        when 'cancelled' then 'Cancelled'
        else 'Completed'
      end::text as status,
      max(charge.created_at) as created_at
    from public.call_sessions session
    join call_charges charge on charge.call_session_id = session.id
    where charge.phone = input_phone
    group by session.id, session.call_type, session.status
  ),
  activity as (
    select
      recharge.id,
      case
        when recharge.source = 'gateway' then 'Coin purchase'
        else 'Coin recharge'
      end::text as title,
      recharge.coin_delta,
      'Recharges'::text as category,
      'Completed'::text as status,
      recharge.created_at
    from public.phone_wallet_recharge_ledger recharge
    where recharge.phone = input_phone

    union all

    select id, title, coin_delta, category, status, created_at
    from call_activity
  )
  select activity.id, activity.title, activity.coin_delta, activity.category,
    activity.status, activity.created_at
  from activity
  order by activity.created_at desc, activity.id desc
  limit least(greatest(coalesce(input_limit, 50), 1), 100);
$$;

revoke all on function public.get_phone_wallet_activity(text, integer)
  from public, anon, authenticated;
grant execute on function public.get_phone_wallet_activity(text, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
