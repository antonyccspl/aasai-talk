begin;

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
  sender_is_male boolean;
  sender_is_approved_host boolean;
  message_coin_cost constant bigint := 3;
  host_message_earning_paise constant bigint := 35;
begin
  if input_sender_phone !~ '^\+91[0-9]{10}$'
     or input_recipient_phone !~ '^\+91[0-9]{10}$'
     or input_sender_phone = input_recipient_phone
     or char_length(trim(input_text)) not between 1 and 4000 then
    raise exception 'Invalid message';
  end if;

  select exists (
    select 1 from public.phone_profiles
    where phone = input_sender_phone and gender = 'Male'
  ) into sender_is_male;
  select exists (
    select 1
    from public.phone_profiles p
    join public.host_applications h on h.phone = p.phone
    where p.phone = input_sender_phone
      and p.gender = 'Female'
      and h.status = 'approved'
  ) into sender_is_approved_host;

  if sender_is_male and not exists (
    select 1
    from public.phone_profiles p
    join public.host_applications h on h.phone = p.phone
    where p.phone = input_recipient_phone
      and p.gender = 'Female'
      and h.status = 'approved'
  ) then
    raise exception 'Messages can only be sent to an approved Host';
  elsif sender_is_approved_host and not exists (
    select 1 from public.phone_profiles
    where phone = input_recipient_phone and gender = 'Male'
  ) then
    raise exception 'Hosts can only message male users';
  elsif not sender_is_male and not sender_is_approved_host then
    raise exception 'Messaging is only available between a male user and an approved Host';
  end if;

  insert into public.phone_wallets(phone)
  values (input_sender_phone), (input_recipient_phone)
  on conflict (phone) do nothing;

  select * into sender_wallet
  from public.phone_wallets
  where phone = input_sender_phone
  for update;
  if sender_is_male and sender_wallet.coins < message_coin_cost then
    raise exception 'Insufficient coins to send message';
  end if;

  if sender_is_male then
    update public.phone_wallets
    set coins = coins - message_coin_cost, updated_at = now()
    where phone = input_sender_phone;
  end if;

  insert into public.phone_messages(sender_phone, recipient_phone, text)
  values (input_sender_phone, input_recipient_phone, trim(input_text))
  returning * into message_row;

  if sender_is_male then
    insert into public.phone_message_wallet_ledger(phone, message_id, coin_delta)
    values (input_sender_phone, message_row.id, -message_coin_cost);

    update public.phone_wallets
    set earnings_paise = earnings_paise + host_message_earning_paise,
        updated_at = now()
    where phone = input_recipient_phone;

    insert into public.phone_message_host_earnings_ledger(
      host_phone, message_id, earnings_paise
    )
    values (input_recipient_phone, message_row.id, host_message_earning_paise);
  end if;

  return jsonb_build_object(
    'message', to_jsonb(message_row),
    'coins_charged', case when sender_is_male then message_coin_cost else 0 end,
    'remaining_coins', sender_wallet.coins - case when sender_is_male then message_coin_cost else 0 end
  );
end;
$$;

revoke all on function public.send_phone_message(text, text, text)
  from public, anon, authenticated;
grant execute on function public.send_phone_message(text, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
