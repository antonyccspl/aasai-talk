begin;

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','finance_admin','moderator','support')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_entity_idx on public.admin_audit_logs(entity_type, entity_id, created_at desc);

create table if not exists public.phone_user_admin_status (
  phone text primary key references public.phone_identities(phone) on delete cascade,
  status text not null default 'active' check (status in ('active','suspended')),
  reason text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.phone_user_admin_status enable row level security;
revoke all on public.admin_roles, public.admin_audit_logs, public.phone_user_admin_status from public, anon, authenticated;
grant all on public.admin_roles, public.admin_audit_logs, public.phone_user_admin_status to service_role;

commit;
