begin;

create table public.receiver_coin_diamond_slabs (
  id uuid primary key default gen_random_uuid(),
  call_type text not null,
  diamonds_per_minute numeric(10,2) not null,
  coins_per_diamond numeric(10,2) not null,
  coins_per_rupee numeric(10,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receiver_coin_diamond_slabs_call_type_check
    check (call_type in ('AUDIO', 'VIDEO')),
  constraint receiver_coin_diamond_slabs_call_type_key unique (call_type)
);

-- The unique constraint supplies the requested call_type B-tree index.
create index receiver_coin_diamond_slabs_is_active_idx
  on public.receiver_coin_diamond_slabs (is_active);

alter table public.receiver_coin_diamond_slabs enable row level security;

revoke all on table public.receiver_coin_diamond_slabs from public, anon, authenticated;
grant select on table public.receiver_coin_diamond_slabs to authenticated;
create policy receiver_coin_diamond_slabs_read_active
  on public.receiver_coin_diamond_slabs
  for select to authenticated
  using (is_active = true);

-- Privileged backend access only; no client write policies or grants.
grant select, insert, update, delete on table public.receiver_coin_diamond_slabs
  to service_role;

comment on column public.receiver_coin_diamond_slabs.updated_at is
  'Defaults at insertion; authorized backend updates must set this timestamp explicitly.';

commit;
