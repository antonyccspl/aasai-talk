begin;

create table if not exists public.phone_message_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  phone text not null references public.phone_identities(phone),
  message_id uuid not null unique references public.phone_messages(id),
  coin_delta bigint not null,
  created_at timestamptz not null default now()
);

alter table public.phone_message_wallet_ledger enable row level security;
revoke all on public.phone_message_wallet_ledger from public, anon, authenticated;
grant all on public.phone_message_wallet_ledger to service_role;

drop function if exists public.send_phone_message(text, text, text);

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
  if sender_wallet.coins < 1 then
    raise exception 'Insufficient coins to send message';
  end if;

  update public.phone_wallets
  set coins = coins - 1, updated_at = now()
  where phone = input_sender_phone;

  insert into public.phone_messages(sender_phone, recipient_phone, text)
  values (input_sender_phone, input_recipient_phone, trim(input_text))
  returning * into message_row;

  insert into public.phone_message_wallet_ledger(phone, message_id, coin_delta)
  values (input_sender_phone, message_row.id, -1);

  return jsonb_build_object(
    'message', to_jsonb(message_row),
    'coins_charged', 1,
    'remaining_coins', sender_wallet.coins - 1
  );
end;
$$;

revoke all on function public.send_phone_message(text, text, text)
  from public, anon, authenticated;
grant execute on function public.send_phone_message(text, text, text)
  to anon, authenticated;

create or replace function public.get_phone_conversations(input_phone text)
returns table (
  other_phone text,
  last_text text,
  last_created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with ranked as (
    select
      case when sender_phone = input_phone then recipient_phone else sender_phone end as other_phone,
      text,
      created_at,
      row_number() over (
        partition by case when sender_phone = input_phone then recipient_phone else sender_phone end
        order by created_at desc
      ) as position
    from public.phone_messages
    where sender_phone = input_phone or recipient_phone = input_phone
  )
  select other_phone, text, created_at
  from ranked
  where position = 1
  order by created_at desc;
$$;

revoke all on function public.get_phone_conversations(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_conversations(text)
  to anon, authenticated;

commit;
