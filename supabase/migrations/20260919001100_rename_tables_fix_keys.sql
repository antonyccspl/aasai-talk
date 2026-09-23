-- Migration: 20260919001100_rename_tables_fix_keys.sql
-- Description: Rename sample_transactions → transactions, sample_calls → calls,
-- sample_messages → messages. Fix primary keys from text to uuid with gen_random_uuid().

begin;

-- 1. Drop old sample_ tables (cascade policies)
drop table if exists public.sample_transactions cascade;
drop table if exists public.sample_calls cascade;
drop table if exists public.sample_messages cascade;

-- 2. Create transactions table with UUID primary key
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount integer not null,
  kind text not null check (kind in ('Recharges', 'Calls', 'Bonus')),
  status text not null check (status in ('Success', 'Completed', 'Processing', 'Failed')),
  date text not null,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
grant select on public.transactions to anon, authenticated;
grant all on public.transactions to service_role;

create policy public_transactions on public.transactions for select using (true);

insert into public.transactions (title, amount, kind, status, date)
values
  ('Wallet recharge (Razorpay)', 500, 'Recharges', 'Success', 'Today, 2:40 PM'),
  ('Audio call with Priya (12 mins)', -240, 'Calls', 'Completed', 'Yesterday · 12 mins'),
  ('Audio call with Arjun (18 mins)', -360, 'Calls', 'Completed', '12 Sep · 18 mins'),
  ('Welcome gift bonus', 100, 'Bonus', 'Success', '10 Sep · New user'),
  ('Video call with Rohan (5 mins)', -250, 'Calls', 'Completed', '09 Sep · 5 mins'),
  ('Wallet recharge (UPI)', 1000, 'Recharges', 'Success', '05 Sep · 6:15 PM');

-- 3. Create calls table with UUID primary key
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  person_id text not null,
  person_name text not null,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null check (status in ('Ended', 'Missed', 'Rejected', 'Busy')),
  seconds integer not null default 0,
  incoming boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.calls enable row level security;
grant select on public.calls to anon, authenticated;
grant all on public.calls to service_role;

create policy public_calls on public.calls for select using (true);

insert into public.calls (person_id, person_name, call_type, status, seconds, incoming)
values
  ('priya', 'Priya Patel', 'audio', 'Ended', 720, false),
  ('rohan', 'Rohan Verma', 'video', 'Missed', 0, true),
  ('arjun', 'Arjun Mehta', 'audio', 'Ended', 1080, false),
  ('sneha', 'Sneha Nair', 'audio', 'Ended', 450, true),
  ('kavya', 'Kavya Sharma', 'video', 'Ended', 620, false);

-- 4. Create messages table with UUID primary key
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_with text not null,
  sender_name text not null,
  is_mine boolean not null default false,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;
grant select on public.messages to anon, authenticated;
grant all on public.messages to service_role;

create policy public_messages on public.messages for select using (true);

insert into public.messages (conversation_with, sender_name, is_mine, text)
values
  ('priya', 'Priya Patel', false, 'Hey! Loved chatting about indie music earlier. Have you heard that new acoustic track? 🎶'),
  ('priya', 'You', true, 'Listening right now, the vocals are incredible! 🎧'),
  ('priya', 'Priya Patel', false, 'Right? It feels so intimate and raw. Reminds me of late night drives.'),
  ('rohan', 'Rohan Verma', false, 'Any travel plans for the weekend? Thinking about heading towards the Western Ghats.'),
  ('rohan', 'You', true, 'That sounds amazing. The monsoon mist up there is magical right now!'),
  ('kavya', 'Kavya Sharma', false, 'Hey there! What''s your go-to song when you need to focus or relax? ✨'),
  ('sneha', 'Sneha Nair', false, 'Loved your perspective on modern storytelling. Let''s do another audio chat soon ☕');

commit;
