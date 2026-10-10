begin;

create table if not exists public.phone_support_tickets (
  id uuid primary key default gen_random_uuid(),
  phone text not null references public.phone_identities(phone) on delete cascade,
  subject text not null check (char_length(trim(subject)) between 3 and 120),
  category text not null check (category in ('account', 'payments', 'calls', 'safety', 'other')),
  status text not null default 'open' check (status in ('open', 'in_review', 'waiting_for_member', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.phone_support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.phone_support_tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('member', 'admin')),
  sender_phone text references public.phone_identities(phone) on delete set null,
  admin_user_id uuid references auth.users(id) on delete set null,
  message text not null check (char_length(trim(message)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check ((sender_type = 'member' and sender_phone is not null and admin_user_id is null)
      or (sender_type = 'admin' and admin_user_id is not null and sender_phone is null))
);

create index if not exists phone_support_tickets_phone_updated_idx on public.phone_support_tickets(phone, updated_at desc);
create index if not exists phone_support_tickets_status_created_idx on public.phone_support_tickets(status, created_at asc);
create index if not exists phone_support_ticket_messages_ticket_created_idx on public.phone_support_ticket_messages(ticket_id, created_at asc);

alter table public.phone_support_tickets enable row level security;
alter table public.phone_support_ticket_messages enable row level security;
revoke all on public.phone_support_tickets, public.phone_support_ticket_messages from public, anon, authenticated;
grant all on public.phone_support_tickets, public.phone_support_ticket_messages to service_role;

insert into public.app_policies_and_settings (key, title, category, content, updated_at)
values (
  'terms', 'Terms and Conditions', 'policy',
  $json$[
    {"title":"Adults only","description":"Aasai Talk is for adults aged 18 and above. By creating or using an account, you confirm that you are at least 18 years old and that your registration information is accurate."},
    {"title":"Use the service respectfully","description":"Use Aasai Talk only for lawful, respectful communication. Do not impersonate others, scam people, spam, harass, threaten, or share prohibited content."},
    {"title":"Calls, coins, and payments","description":"Any paid features are shown before you confirm them. Prices, availability, and call quality can vary with your network and the services you use."},
    {"title":"Help and support","description":"You can use the in-app Help centre to open a support request, send details to our team, and follow its status. We may contact you through that request when more information is needed."},
    {"title":"Enforcement","description":"We may limit, suspend, or remove accounts that break these terms or create a safety risk. You can report a decision or safety concern through in-app support."}
  ]$json$::jsonb, now()
)
on conflict (key) do update set title = excluded.title, category = excluded.category, content = excluded.content, updated_at = excluded.updated_at;

commit;
