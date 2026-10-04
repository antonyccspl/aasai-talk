begin;

create table if not exists public.admin_moderation_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('phone_user', 'host_application', 'safety_report')),
  entity_id text not null,
  note text not null check (length(trim(note)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists admin_moderation_notes_entity_created_idx
  on public.admin_moderation_notes(entity_type, entity_id, created_at desc);

alter table public.admin_moderation_notes enable row level security;
revoke all on public.admin_moderation_notes from public, anon, authenticated;
grant all on public.admin_moderation_notes to service_role;

commit;
