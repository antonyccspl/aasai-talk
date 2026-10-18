begin;

create table if not exists public.phone_notification_preferences (
  phone text primary key references public.phone_identities(phone) on delete cascade,
  calls_enabled boolean not null default true,
  messages_enabled boolean not null default true,
  wallet_enabled boolean not null default true,
  announcements_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.phone_notification_preferences (
  phone, calls_enabled, messages_enabled, wallet_enabled
)
select
  phone,
  bool_and(calls_enabled),
  bool_and(messages_enabled),
  bool_and(wallet_enabled)
from public.phone_push_tokens
group by phone
on conflict (phone) do nothing;

alter table public.phone_notification_preferences enable row level security;
revoke all on public.phone_notification_preferences from public, anon, authenticated;
grant all on public.phone_notification_preferences to service_role;

commit;
