begin;

-- Reverse the short-lived message-host credit rule. Call earnings remain
-- untouched; messages never contribute to host earnings.
with message_credits as (
  select host_phone, sum(earnings_paise) as earnings_paise
  from public.phone_message_host_earnings_ledger
  group by host_phone
)
update public.phone_wallets wallet
set earnings_paise = greatest(0, wallet.earnings_paise - message_credits.earnings_paise),
    updated_at = now()
from message_credits
where wallet.phone = message_credits.host_phone;

delete from public.phone_message_host_earnings_ledger;

create or replace function public.send_phone_message(
  input_sender_phone text,
  input_recipient_phone text,
  input_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_row public.phone_messages;
  sender_wallet public.phone_wallets;
  message_coin_cost constant bigint := 1;
begin
  if input_sender_phone !~ '^\+91[0-9]{10}$'
     or input_recipient_phone !~ '^\+91[0-9]{10}$'
     or input_sender_phone = input_recipient_phone
     or char_length(trim(input_text)) not between 1 and 4000 then
    raise exception 'Invalid message';
  end if;

  insert into public.phone_wallets(phone)
  values (input_sender_phone)
  on conflict (phone) do nothing;

  select * into sender_wallet
  from public.phone_wallets
  where phone = input_sender_phone
  for update;
  if sender_wallet.coins < message_coin_cost then
    raise exception 'Insufficient coins to send message';
  end if;

  update public.phone_wallets
  set coins = coins - message_coin_cost, updated_at = now()
  where phone = input_sender_phone;

  insert into public.phone_messages(sender_phone, recipient_phone, text)
  values (input_sender_phone, input_recipient_phone, trim(input_text))
  returning * into message_row;

  insert into public.phone_message_wallet_ledger(phone, message_id, coin_delta)
  values (input_sender_phone, message_row.id, -message_coin_cost);

  return jsonb_build_object(
    'message', to_jsonb(message_row),
    'coins_charged', message_coin_cost,
    'remaining_coins', sender_wallet.coins - message_coin_cost
  );
end;
$$;

create or replace function public.get_phone_host_dashboard(input_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if input_phone !~ '^\+91[0-9]{10}$' then raise exception 'Invalid phone'; end if;
  return jsonb_build_object(
    'today_calls', (select count(*) from public.host_call_time_ledger where host_phone=input_phone and call_date=current_date),
    'today_seconds', coalesce((select sum(duration_seconds) from public.host_call_time_ledger where host_phone=input_phone and call_date=current_date),0) + coalesce((select sum(greatest(0,floor(extract(epoch from now()-connected_at))::integer)) from public.call_sessions where host_phone=input_phone and status='connected' and connected_at>=current_date),0),
    'today_earnings_paise', coalesce((select sum(earnings_paise) from public.phone_host_earnings_ledger where host_phone=input_phone and created_at>=current_date),0),
    'total_calls', (select count(*) from public.host_call_time_ledger where host_phone=input_phone),
    'total_earnings_paise', coalesce((select sum(earnings_paise) from public.phone_host_earnings_ledger where host_phone=input_phone),0),
    'active_calls', (select count(*) from public.call_sessions where host_phone=input_phone and status='connected'),
    'missed_calls', (select count(*) from public.call_sessions where host_phone=input_phone and status in ('missed','rejected')),
    'recent_calls', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'caller_phone',c.caller_phone,'call_type',c.call_type,'status',c.status,'duration_seconds',c.duration_seconds,'created_at',c.created_at) order by c.created_at desc) from (select * from public.call_sessions where host_phone=input_phone and status in ('ended','missed','rejected') order by created_at desc limit 5)c),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.send_phone_message(text, text, text)
  from public, anon, authenticated;
grant execute on function public.send_phone_message(text, text, text)
  to anon, authenticated;
revoke all on function public.get_phone_host_dashboard(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_host_dashboard(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
