begin;

create table if not exists public.phone_host_compliance (
  host_phone text primary key references public.phone_identities(phone) on delete cascade,
  pan_last4 text check (pan_last4 is null or pan_last4 ~ '^[A-Z0-9]{4}$'),
  aadhaar_last4 text check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
  pan_verified boolean not null default false,
  aadhaar_verified boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.phone_host_compliance enable row level security;
revoke all on public.phone_host_compliance from public, anon, authenticated;
grant all on public.phone_host_compliance to service_role;

commit;
