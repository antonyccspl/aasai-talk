begin;

create or replace function public.get_phone_wallet_balance(input_phone text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select coalesce((select coins from public.phone_wallets where phone = input_phone), 0);
$$;

revoke all on function public.get_phone_wallet_balance(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_wallet_balance(text)
  to anon, authenticated;

commit;
