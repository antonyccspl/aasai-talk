begin;

create table if not exists public.phone_web_push_subscriptions (
  endpoint text primary key,
  phone text not null references public.phone_identities(phone) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists phone_web_push_subscriptions_phone_idx
  on public.phone_web_push_subscriptions(phone);

alter table public.phone_web_push_subscriptions enable row level security;
revoke all on public.phone_web_push_subscriptions from public, anon, authenticated;
grant all on public.phone_web_push_subscriptions to service_role;

commit;
