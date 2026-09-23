-- Migration: 20260919001000_dynamic_platform_data.sql
-- Description: Expand directory profiles, add announcements, notifications,
-- policies, safety reports, sample transactions, sample calls, sample messages,
-- and platform metrics for full dynamic data binding across the app.

begin;

-- 1. Ensure directory_profiles.id defaults to gen_random_uuid()
alter table public.directory_profiles alter column id set default gen_random_uuid();

-- 2. Insert diverse additional profiles into directory_profiles
insert into public.directory_profiles (id, display_name, age, gender, city, languages, interests, bio, availability, avatar_url, accent_color, is_visible)
values
  (
    '4a1d86d2-7492-4f9e-8c33-8a3d11b3e901',
    'Kavya Sharma',
    22,
    'Woman',
    'Delhi',
    array['Hindi', 'English', 'Punjabi'],
    array['Late night talks', 'Psychology', 'Coffee'],
    'Studying human behavior by day, vibing to lo-fi and deep talks by night. What is your unwritten life rule?',
    'Available',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
    '#2c5443',
    true
  ),
  (
    '7b2e97e3-8503-4e0f-9d44-9b4e22c4f002',
    'Vikram Malhotra',
    27,
    'Man',
    'Mumbai',
    array['Hindi', 'English', 'Marathi'],
    array['Filmmaking', 'Travel', 'Photography'],
    'Independent cinematographer capturing quiet city moments. Let’s talk cinema, stories, and untold journeys.',
    'Available',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80',
    '#3e4a3d',
    true
  ),
  (
    '8c3f08f4-9614-4f1a-ae55-ac5f33d50103',
    'Sneha Nair',
    24,
    'Woman',
    'Bengaluru',
    array['English', 'Malayalam', 'Tamil'],
    array['Books', 'Classical Music', 'Philosophy'],
    'Bookworm, espresso enthusiast, and lover of Carnatic classical fusion. Tell me about your favorite book chapter.',
    'Available',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80',
    '#4a3852',
    true
  ),
  (
    '9d4a19a5-0725-4a2b-bf66-bd6a44e61204',
    'Kabir Sen',
    26,
    'Man',
    'Kolkata',
    array['English', 'Bengali', 'Hindi'],
    array['Art', 'Indie Cinema', 'Poetry'],
    'Living between coffee shops and art galleries on Park Street. Tell me what inspires your creative spark.',
    'Busy',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=80',
    '#584439',
    true
  ),
  (
    'ae5b2ab6-1836-4b3c-8077-ce7b55f72305',
    'Meera Joshi',
    23,
    'Woman',
    'Pune',
    array['Marathi', 'Hindi', 'English'],
    array['Standup Comedy', 'Astrology', 'Food Walks'],
    'Finding humor in daily chaos. Always down for good banter, food debates, and acoustic playlists.',
    'Available',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=80',
    '#2d5045',
    true
  ),
  (
    'bf6c3bc7-2947-4c4d-8188-df8c66a83406',
    'Rahul Choudhary',
    28,
    'Man',
    'Jaipur',
    array['Hindi', 'English', 'Marwari'],
    array['Storytelling', 'Folk Music', 'Architecture'],
    'Fascinated by ancient heritage, starry desert nights, and heartfelt stories over hot cutting chai.',
    'Available',
    'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&auto=format&fit=crop&q=80',
    '#4b4034',
    true
  ),
  (
    'c07d4cd8-3058-4d5e-8299-e09d77b94507',
    'Divya Krishnan',
    25,
    'Woman',
    'Chennai',
    array['Tamil', 'English'],
    array['Podcasting', 'Philosophy', 'Late night talks'],
    'Curating spoken audio snippets and late night reflections. Ready for thoughtful conversations that matter.',
    'Offline',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&auto=format&fit=crop&q=80',
    '#394e50',
    true
  ),
  (
    'd18e5de9-4169-4e6f-83aa-f1ae88ca5608',
    'Aman Verma',
    24,
    'Man',
    'Chandigarh',
    array['Punjabi', 'Hindi', 'English'],
    array['Fitness', 'Late night drives', 'Acoustic'],
    'Early morning workouts, late night highway playlist enthusiast. Ask me for my top 5 road trip songs.',
    'Available',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&auto=format&fit=crop&q=80',
    '#38483b',
    true
  )
on conflict (id) do nothing;

-- 3. Announcements Table
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'All users',
  tag text not null default 'Update',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
grant select on public.announcements to anon, authenticated;
grant all on public.announcements to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'announcements' and policyname = 'public_announcements') then
    create policy public_announcements on public.announcements for select using (is_active = true);
  end if;
end $$;

insert into public.announcements (title, message, audience, tag, is_active)
values
  ('Late Night Acoustic Chill', 'Connect with verified creators and music lovers tonight from 10:00 PM onwards.', 'All users', 'Event', true),
  ('New Weekend Recharge Bonus', 'Get 10% extra coins on any recharge pack above 500 coins this weekend.', 'All users', 'Offer', true),
  ('Community Safety Center Live', 'Review our updated zero-tolerance harassment and respectful speech guidelines.', 'All users', 'Safety', true),
  ('Monsoon Voice Rooms', 'Discover new conversational rooms curated by regional language and interests.', 'All users', 'Feature', true)
on conflict do nothing;

-- 4. Notifications Table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  path text not null,
  icon text not null default 'message-circle',
  is_global boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
grant select on public.notifications to anon, authenticated;
grant all on public.notifications to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'notifications' and policyname = 'public_notifications') then
    create policy public_notifications on public.notifications for select using (is_global = true);
  end if;
end $$;

insert into public.notifications (title, body, path, icon, is_global)
values
  ('Welcome to Talkative', 'Find your people. Start with a warm hello and explore live conversations.', '/explore', 'radio', true),
  ('A new conversation awaits', 'Priya Patel sent you a message: "Loved chatting about indie music..."', '/chat/priya', 'message-circle', true),
  ('Missed video call', 'Rohan tried reaching you yesterday for a quick catch-up.', '/calls', 'video', true),
  ('Wallet recharged', '500 coins added successfully to your balance. Start a voice call anytime.', '/wallet/transactions', 'credit-card', true),
  ('Safety reminder', 'Never share personal banking OTPs or private financial credentials in chat.', '/settings/policies/safety', 'shield', true)
on conflict do nothing;

-- 5. Policies & App Settings Table
create table if not exists public.app_policies_and_settings (
  key text primary key,
  title text not null,
  category text not null check (category in ('policy', 'setting')),
  content jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_policies_and_settings enable row level security;
grant select on public.app_policies_and_settings to anon, authenticated;
grant all on public.app_policies_and_settings to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'app_policies_and_settings' and policyname = 'public_policies_and_settings') then
    create policy public_policies_and_settings on public.app_policies_and_settings for select using (true);
  end if;
end $$;

insert into public.app_policies_and_settings (key, title, category, content)
values
  (
    'privacy',
    'Privacy Policy',
    'policy',
    $json$[
      {
        "title": "Your Voice & Call Privacy",
        "description": "Calls on Talkative are strictly real-time and ephemeral. We do not record, store, wiretap, or analyze the audio or video content of your personal one-on-one calls. Once a call ends, the media stream is permanently terminated."
      },
      {
        "title": "Information We Collect",
        "description": "We only collect basic account data: your chosen display name, username, city, languages, interests, and profile photo. For wallet transactions, order references from our payment gateway (Razorpay) are securely retained for accounting."
      },
      {
        "title": "Data Protection & RLS",
        "description": "All personal data is protected with PostgreSQL Row Level Security (RLS). Only authenticated users have access to their personal settings, messages, and wallet ledgers. Passwords and payment secrets never touch the mobile device."
      },
      {
        "title": "Account Deletion Rights",
        "description": "You retain absolute ownership of your profile. Requesting an account deletion triggers an irreversible 15-day purge of all associated profile records, chat drafts, and device identifiers."
      }
    ]$json$::jsonb
  ),
  (
    'terms',
    'Terms of Service',
    'policy',
    $json$[
      {
        "title": "Eligibility & Age Requirement",
        "description": "Talkative is an adult social communication platform. You must be at least 18 years of age to register an account, browse community profiles, participate in chats, or initiate voice calls."
      },
      {
        "title": "Virtual Currency & Coins",
        "description": "Coins and diamonds are virtual utility tokens used solely for platform interactions and calling duration. Coins have no direct monetary redemption value for standard users and cannot be transferred between third parties."
      },
      {
        "title": "Acceptable Conduct",
        "description": "Users agree to treat everyone with dignity and respect. Any harassment, hate speech, abusive language, non-consensual solicitation, or fraudulent activity results in immediate, permanent account termination."
      },
      {
        "title": "Service Availability",
        "description": "While we strive for 99.9% network reliability, call quality depends on local internet conditions. Talkative is provided on an as-is basis without warranties of uninterrupted uptime."
      }
    ]$json$::jsonb
  ),
  (
    'safety',
    'Safety Center',
    'policy',
    $json$[
      {
        "title": "Zero-Tolerance Harassment Policy",
        "description": "We maintain a strict zero-tolerance policy against cyberbullying, harassment, intimidation, and unauthorized sharing of personal contact information."
      },
      {
        "title": "Instant Blocking",
        "description": "You can block any user at any moment with a single tap. Blocked users cannot view your availability, send messages, or place incoming audio/video calls to your account."
      },
      {
        "title": "Reporting Mechanism",
        "description": "Our human moderation team investigates all safety reports within 24 hours. Users found violating community rules face immediate temporary suspension or permanent device bans."
      },
      {
        "title": "Emergency & Support",
        "description": "If you experience any threats or unlawful behavior, report the profile immediately in-app and contact our 24/7 trust and safety desk at safety@talkative.app."
      }
    ]$json$::jsonb
  ),
  (
    'community',
    'Community Guidelines',
    'policy',
    $json$[
      {
        "title": "Be Kind & Respectful",
        "description": "Talkative is built on acoustic intimacy and authentic conversations. Approach new connections with openness, kindness, and empathy."
      },
      {
        "title": "Respect Boundaries",
        "description": "If someone declines a call or takes time to respond to a message, honor their space. No means no."
      },
      {
        "title": "Keep it Clean",
        "description": "Profile photos, bios, and public tags must be suitable for a general adult community. Explicit nudity and graphic content are strictly prohibited."
      },
      {
        "title": "Authentic Identity",
        "description": "Do not impersonate celebrities, public figures, or other members. Authenticity makes our community safe and enjoyable."
      }
    ]$json$::jsonb
  ),
  (
    'refund',
    'Refund & Recharge Policy',
    'policy',
    $json$[
      {
        "title": "Prepaid Coin Recharges",
        "description": "All wallet coin purchases processed via Razorpay are credited immediately upon bank confirmation. Please verify your selected pack before payment."
      },
      {
        "title": "Failed Transactions",
        "description": "If funds are debited from your bank account but coins are not credited due to network timeouts, our automated reconciliation reconciles or refunds the transaction within 48 business hours."
      },
      {
        "title": "Consumed Call Minutes",
        "description": "Coins utilized for completed or ongoing calls are non-refundable once the connection has been established and minutes consumed."
      },
      {
        "title": "Disputes & Inquiries",
        "description": "For any billing queries or disputed charges, reach our finance support desk at billing@talkative.app with your Razorpay payment ID."
      }
    ]$json$::jsonb
  ),
  (
    'app_config',
    'Application Configuration',
    'setting',
    $json${
      "maintenance_mode": false,
      "maintenance_message": "Talkative is currently undergoing scheduled maintenance. We will be back shortly.",
      "minimum_app_version": "1.0.0",
      "support_email": "support@talkative.app",
      "support_phone": "+91 98765 43210",
      "new_user_bonus_coins": 100,
      "audio_rate_diamonds_per_min": 2,
      "video_rate_diamonds_per_min": 5,
      "coins_per_diamond": 10
    }$json$::jsonb
  )
on conflict (key) do update
set content = excluded.content, updated_at = now();

-- 6. Safety Reports Table
create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_name text not null,
  reported_user_id text not null,
  reported_user_name text not null,
  reason text not null,
  details text not null default '',
  status text not null default 'Open' check (status in ('Open', 'Under review', 'Resolved', 'Rejected')),
  resolution_note text,
  created_at timestamptz not null default now()
);

alter table public.safety_reports enable row level security;
grant select, insert, update on public.safety_reports to anon, authenticated;
grant all on public.safety_reports to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'safety_reports' and policyname = 'public_safety_reports') then
    create policy public_safety_reports on public.safety_reports for all using (true);
  end if;
end $$;

insert into public.safety_reports (reporter_name, reported_user_id, reported_user_name, reason, details, status, resolution_note)
values
  ('Ananya Rao', 'priya', 'Priya Patel', 'Spam concern', 'Repeated unsolicited promotion of external music links.', 'Open', null),
  ('Mahir', 'rohan', 'Rohan Verma', 'Abusive language', 'Unacceptable language during an audio conversation.', 'Under review', 'Reviewing participant call metadata.'),
  ('Sneha Nair', 'arjun', 'Arjun Mehta', 'Profile concern', 'Profile bio contains questionable external advertising claims.', 'Resolved', 'User warned and bio corrected.'),
  ('Vikram Malhotra', 'kabir', 'Kabir Sen', 'Audio disruption', 'Intentional loud static noise during call session.', 'Open', null)
on conflict do nothing;

-- 7. Sample Transactions Table
create table if not exists public.sample_transactions (
  id text primary key,
  title text not null,
  amount integer not null,
  kind text not null check (kind in ('Recharges', 'Calls', 'Bonus')),
  status text not null check (status in ('Success', 'Completed', 'Processing', 'Failed')),
  date text not null,
  created_at timestamptz not null default now()
);

alter table public.sample_transactions enable row level security;
grant select on public.sample_transactions to anon, authenticated;
grant all on public.sample_transactions to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sample_transactions' and policyname = 'public_sample_transactions') then
    create policy public_sample_transactions on public.sample_transactions for select using (true);
  end if;
end $$;

insert into public.sample_transactions (id, title, amount, kind, status, date)
values
  ('TX-2401', 'Wallet recharge (Razorpay)', 500, 'Recharges', 'Success', 'Today, 2:40 PM'),
  ('TX-2400', 'Audio call with Priya (12 mins)', -240, 'Calls', 'Completed', 'Yesterday · 12 mins'),
  ('TX-2399', 'Audio call with Arjun (18 mins)', -360, 'Calls', 'Completed', '12 Sep · 18 mins'),
  ('TX-2398', 'Welcome gift bonus', 100, 'Bonus', 'Success', '10 Sep · New user'),
  ('TX-2397', 'Video call with Rohan (5 mins)', -250, 'Calls', 'Completed', '09 Sep · 5 mins'),
  ('TX-2396', 'Wallet recharge (UPI)', 1000, 'Recharges', 'Success', '05 Sep · 6:15 PM')
on conflict (id) do nothing;

-- 8. Sample Calls Table
create table if not exists public.sample_calls (
  id text primary key,
  person_id text not null,
  person_name text not null,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null check (status in ('Ended', 'Missed', 'Rejected', 'Busy')),
  seconds integer not null default 0,
  incoming boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.sample_calls enable row level security;
grant select on public.sample_calls to anon, authenticated;
grant all on public.sample_calls to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sample_calls' and policyname = 'public_sample_calls') then
    create policy public_sample_calls on public.sample_calls for select using (true);
  end if;
end $$;

insert into public.sample_calls (id, person_id, person_name, call_type, status, seconds, incoming)
values
  ('call-1', 'priya', 'Priya Patel', 'audio', 'Ended', 720, false),
  ('call-2', 'rohan', 'Rohan Verma', 'video', 'Missed', 0, true),
  ('call-3', 'arjun', 'Arjun Mehta', 'audio', 'Ended', 1080, false),
  ('call-4', 'sneha', 'Sneha Nair', 'audio', 'Ended', 450, true),
  ('call-5', 'kavya', 'Kavya Sharma', 'video', 'Ended', 620, false)
on conflict (id) do nothing;

-- 9. Sample Messages Table
create table if not exists public.sample_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_with text not null,
  sender_name text not null,
  is_mine boolean not null default false,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.sample_messages enable row level security;
grant select on public.sample_messages to anon, authenticated;
grant all on public.sample_messages to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sample_messages' and policyname = 'public_sample_messages') then
    create policy public_sample_messages on public.sample_messages for select using (true);
  end if;
end $$;

insert into public.sample_messages (conversation_with, sender_name, is_mine, text)
values
  ('priya', 'Priya Patel', false, 'Hey! Loved chatting about indie music earlier. Have you heard that new acoustic track? 🎶'),
  ('priya', 'You', true, 'Listening right now, the vocals are incredible! 🎧'),
  ('priya', 'Priya Patel', false, 'Right? It feels so intimate and raw. Reminds me of late night drives.'),
  ('rohan', 'Rohan Verma', false, 'Any travel plans for the weekend? Thinking about heading towards the Western Ghats.'),
  ('rohan', 'You', true, 'That sounds amazing. The monsoon mist up there is magical right now!'),
  ('kavya', 'Kavya Sharma', false, 'Hey there! What’s your go-to song when you need to focus or relax? ✨'),
  ('sneha', 'Sneha Nair', false, 'Loved your perspective on modern storytelling. Let’s do another audio chat soon ☕')
on conflict do nothing;

-- 10. Platform Metrics Table
create table if not exists public.platform_metrics (
  metric_key text primary key,
  metric_label text not null,
  metric_value text not null,
  sub_text text,
  chart_data integer[],
  updated_at timestamptz not null default now()
);

alter table public.platform_metrics enable row level security;
grant select on public.platform_metrics to anon, authenticated;
grant all on public.platform_metrics to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'platform_metrics' and policyname = 'public_platform_metrics') then
    create policy public_platform_metrics on public.platform_metrics for select using (true);
  end if;
end $$;

insert into public.platform_metrics (metric_key, metric_label, metric_value, sub_text, chart_data)
values
  ('total_users', 'Total users', '12', 'Active community profiles', array[65, 100, 85, 135, 115, 155, 143]),
  ('online_now', 'Online now', '9', 'Available for calls', null),
  ('call_sessions', 'Call sessions', '284', 'Weekly completed calls', null),
  ('recharge_coins', 'Recharge volume', '18,500', 'Coins purchased this month', null),
  ('analytics_summary', 'Platform Analytics', '94% Call Acceptance', '4,632 audio mins · 2,140 video mins', array[45, 78, 62, 95, 110, 140, 125])
on conflict (metric_key) do update
set metric_value = excluded.metric_value, sub_text = excluded.sub_text, chart_data = excluded.chart_data, updated_at = now();

commit;
