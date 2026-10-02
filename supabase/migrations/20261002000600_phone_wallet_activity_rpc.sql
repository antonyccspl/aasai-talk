begin;

-- Wallet tables are intentionally private. This narrow read RPC provides the
-- signed-in app with a display-safe activity feed without exposing the ledgers
-- through the REST API.
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
  select activity.id, activity.title, activity.coin_delta, activity.category,
    activity.status, activity.created_at
  from (
    select recharge.id,
      'Coin recharge'::text as title,
      recharge.coin_delta,
      'Recharges'::text as category,
      'Completed'::text as status,
      recharge.created_at
    from public.phone_wallet_recharge_ledger recharge
    where recharge.phone = input_phone

    union all

    select minute_charge.id,
      case session.call_type
        when 'video' then 'Video call'
        else 'Audio call'
      end as title,
      minute_charge.coin_delta,
      'Calls'::text as category,
      case session.status
        when 'connected' then 'In progress'
        when 'ended' then 'Completed'
        when 'missed' then 'Missed'
        when 'rejected' then 'Declined'
        when 'cancelled' then 'Cancelled'
        else 'Completed'
      end as status,
      minute_charge.created_at
    from public.phone_call_minute_ledger minute_charge
    join public.call_sessions session on session.id = minute_charge.call_session_id
    where minute_charge.phone = input_phone

    union all

    select settlement.id,
      case session.call_type
        when 'video' then 'Video call'
        else 'Audio call'
      end as title,
      settlement.coin_delta,
      'Calls'::text as category,
      case session.status
        when 'connected' then 'In progress'
        when 'ended' then 'Completed'
        when 'missed' then 'Missed'
        when 'rejected' then 'Declined'
        when 'cancelled' then 'Cancelled'
        else 'Completed'
      end as status,
      settlement.created_at
    from public.phone_wallet_ledger settlement
    join public.call_sessions session on session.id = settlement.call_session_id
    where settlement.phone = input_phone
      and settlement.coin_delta <> 0
  ) activity
  order by activity.created_at desc, activity.id desc
  limit least(greatest(coalesce(input_limit, 50), 1), 100);
$$;

revoke all on function public.get_phone_wallet_activity(text, integer)
  from public, anon, authenticated;
grant execute on function public.get_phone_wallet_activity(text, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
