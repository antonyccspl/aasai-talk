begin;

alter table public.user_settings
  add column if not exists availability text not null default 'Available'
  check (availability in ('Available', 'Busy', 'Offline'));

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  favorite_user_id uuid not null references public.directory_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_user_id),
  check (user_id <> favorite_user_id)
);

create table if not exists public.blocked_users (
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references public.directory_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  check (user_id <> blocked_user_id)
);

alter table public.favorites enable row level security;
alter table public.blocked_users enable row level security;
revoke all on public.favorites, public.blocked_users from anon;
grant select, insert, delete on public.favorites, public.blocked_users to authenticated;
grant all on public.favorites, public.blocked_users to service_role;

drop policy if exists favorites_owner on public.favorites;
create policy favorites_owner on public.favorites for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists blocked_users_owner on public.blocked_users;
create policy blocked_users_owner on public.blocked_users for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

commit;
