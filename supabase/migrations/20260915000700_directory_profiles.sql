-- Public, non-sensitive discovery directory. This replaces the app-embedded people fixture.
begin;

create table public.directory_profiles (
  id text primary key check (id ~ '^[a-z0-9_-]{3,64}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  age smallint not null check (age >= 18 and age <= 120),
  gender text not null check (gender in ('Male','Female','Man','Woman')),
  city text not null default '' check (length(city) <= 100),
  languages text[] not null default '{}',
  interests text[] not null default '{}',
  bio text not null default '' check (length(bio) <= 500),
  availability text not null default 'Offline' check (availability in ('Available','Busy','Offline')),
  avatar_url text,
  accent_color text not null default '#285647' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index directory_profiles_visible_availability on public.directory_profiles(is_visible, availability);
alter table public.directory_profiles enable row level security;
revoke all on public.directory_profiles from public, anon, authenticated;
grant select on public.directory_profiles to anon, authenticated;
create policy public_visible_directory on public.directory_profiles for select to anon, authenticated using (is_visible);
grant all on public.directory_profiles to service_role;

-- Existing directory content is now database data, not an app fixture.
insert into public.directory_profiles (id,display_name,age,gender,city,languages,interests,bio,availability,accent_color,avatar_url) values
('priya','Priya Patel',23,'Woman','Delhi',array['Hindi','English'],array['Late night talks','Poetry'],'A little poetry, a little indie music, and conversations that make you forget to check the time.','Available','#285647','https://lh3.googleusercontent.com/aida-public/AB6AXuCLMpZmgpUETRuSeQ4sWwRhI6hzr5B31dmEwX6nSmhKsZ85HZxgU7hGTiQjZFLAHQCGEkON6nSG6ZZcUx4wgpGNzs76rw_Z03myqZb8wKvr21mBzbNyqlsq0CTQ0XVlwx5J4OZXZjfahqCrSAWRq1GWxIEeW4cF2ZvCVaHe8pUpmXdK0b4CI3JM7KS1ogfpKeLifp0x0mEWs0H1QunejokNqpRvvQusiDAKtQE4_zPqKrr2XAA9lL8lIw'),
('rohan','Rohan Verma',24,'Man','Mumbai',array['Hindi','English'],array['Indie music','Travel'],'Collecting stories, photographs, and recommendations for my next adventure. What is yours?','Available','#42483b','https://lh3.googleusercontent.com/aida-public/AB6AXuDYGfY1XjtMQyNB8YGQj_UA75_D-QEO3sPJihznj8KYBwbcfYVMFiYkZDbnkaqx08wVGrpV-p6yqORKFLkV5BwdB9Gx_KbSKC83ZGwwZORxgvFktV-tDTri1ID5PDXfsfz35PSA0HUuzuoW-6RYmAeq3wuWTm9NWB9Rvq0CVM18__aXiuQh2AOJJuNZzFMWLOM6yuJyRy6Xo00mSKvDQraeoOfFhMy1xAl0QpUS4dQo9YWwKut-Lsx8Cw'),
('ananya','Ananya Rao',25,'Woman','Bengaluru',array['English','Kannada'],array['Books','Coffee'],'Currently reading three books at once. Always up for a thoughtful conversation.','Busy','#564858',null),
('arjun','Arjun Mehta',26,'Man','Pune',array['Hindi','English'],array['Music','Movies'],'Tell me about the last film that stayed with you.','Offline','#554739',null)
on conflict (id) do nothing;

commit;
