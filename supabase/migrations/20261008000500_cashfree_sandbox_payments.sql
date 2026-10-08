begin;

alter table public.phone_payment_orders
  add column if not exists provider text;

update public.phone_payment_orders
  set provider = 'cashfree'
  where provider is null;

alter table public.phone_payment_orders
  alter column provider set default 'cashfree',
  alter column provider set not null;

alter table public.phone_payment_orders
  drop constraint if exists phone_payment_orders_provider_check;
alter table public.phone_payment_orders
  add constraint phone_payment_orders_provider_check check (provider = 'cashfree');

create index if not exists phone_payment_orders_cashfree_order_idx
  on public.phone_payment_orders(provider, provider_order_id);

commit;
