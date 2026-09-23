-- Account foundation. Financial and verification state is server-owned.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  gender text not null check (gender in ('Male','Female')),
  date_of_birth date not null,
  bio text not null default '' check (length(bio) <= 500),
  city text not null default '',
  languages text[] not null default '{}',
  interests text[] not null default '{}',
  avatar_path text,
  created_at timestamptz not null default now()
);
create function public.enforce_adult_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'You must be at least 18 years old' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger enforce_adult_profile before insert or update on public.profiles
for each row execute function public.enforce_adult_profile();

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','light')),
  allow_messages boolean not null default true,
  allow_calls boolean not null default true,
  notifications_enabled boolean not null default true
);
create table public.host_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','pending','approved','rejected')),
  aadhaar_path text,
  pan_path text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create table public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins bigint not null default 0 check (coins >= 0),
  earnings_paise bigint not null default 0 check (earnings_paise >= 0)
);
create table public.coin_packs (
  id uuid primary key default gen_random_uuid(),
  coins integer not null check (coins > 0),
  price_paise integer not null check (price_paise > 0),
  active boolean not null default true,
  sort_order integer not null default 0
);
insert into public.coin_packs (coins, price_paise, sort_order)
select n, n * 200, n from unnest(array[100,250,500,750,1000,1500]) n;
create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  coin_delta bigint not null default 0,
  earnings_delta_paise bigint not null default 0,
  kind text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (coin_delta <> 0 or earnings_delta_paise <> 0)
);
create index wallet_ledger_owner_date on public.wallet_ledger(user_id, created_at desc);
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  amount_paise bigint not null check (amount_paise >= 10000),
  status text not null default 'pending' check (status in ('pending','processing','completed','rejected','failed')),
  payout_reference text unique,
  created_at timestamptz not null default now()
);
create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id),
  reason text not null check (reason in ('Asked for money','Not interested','Unable to hear','Buddy not polite','Abusive language','Others')),
  details text check (length(details) <= 2000),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '15 days'),
  check (reason <> 'Others' or (details is not null and length(trim(details)) > 0))
);

-- Explicit grants as well as RLS: app clients cannot credit wallets or approve Hosts.
do $$ declare t text; begin
  foreach t in array array['profiles','user_settings','host_applications','wallets','coin_packs','wallet_ledger','withdrawals','account_deletion_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant select, insert, update on public.profiles, public.user_settings to authenticated;
create policy profile_owner on public.profiles for all to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy settings_owner on public.user_settings for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.host_applications, public.wallets, public.wallet_ledger, public.withdrawals, public.account_deletion_requests to authenticated;
create policy application_owner on public.host_applications for select to authenticated using (user_id = (select auth.uid()));
create policy wallet_owner on public.wallets for select to authenticated using (user_id = (select auth.uid()));
create policy ledger_owner on public.wallet_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy withdrawal_owner on public.withdrawals for select to authenticated using (user_id = (select auth.uid()));
create policy deletion_owner on public.account_deletion_requests for select to authenticated using (user_id = (select auth.uid()));
grant select on public.coin_packs to authenticated;
create policy active_packs on public.coin_packs for select to authenticated using (active);
revoke all on function public.enforce_adult_profile() from public, anon, authenticated;

-- Private buckets; verification documents never receive public URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars',false,5242880,array['image/jpeg','image/png','image/webp']),
       ('host-verification','host-verification',false,10485760,array['image/jpeg','image/png','application/pdf']);
create policy owner_upload on storage.objects for insert to authenticated
with check (bucket_id in ('avatars','host-verification') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy owner_read on storage.objects for select to authenticated
using (bucket_id in ('avatars','host-verification') and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
