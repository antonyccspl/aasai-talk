begin;

create table if not exists public.phone_push_tokens (
  expo_push_token text primary key,
  phone text not null references public.phone_identities(phone) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  calls_enabled boolean not null default true,
  messages_enabled boolean not null default true,
  wallet_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists phone_push_tokens_phone_idx
  on public.phone_push_tokens(phone);

create table if not exists public.phone_push_deliveries (
  event_key text not null,
  recipient_phone text not null references public.phone_identities(phone) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_key, recipient_phone)
);

alter table public.phone_push_tokens enable row level security;
alter table public.phone_push_deliveries enable row level security;
revoke all on public.phone_push_tokens, public.phone_push_deliveries
  from public, anon, authenticated;
grant all on public.phone_push_tokens, public.phone_push_deliveries
  to service_role;

commit;