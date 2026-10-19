begin;

create table if not exists public.phone_user_presence (
  phone text primary key references public.phone_identities(phone) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists phone_user_presence_last_seen_idx
  on public.phone_user_presence(last_seen_at desc);

alter table public.phone_user_presence enable row level security;
revoke all on public.phone_user_presence from public, anon, authenticated;
grant all on public.phone_user_presence to service_role;

create or replace function public.get_admin_online_presence()
returns table (
  member_type text,
  phone text,
  display_name text,
  username text,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    'host'::text,
    profile.phone,
    profile.display_name,
    profile.username,
    presence.last_seen_at
  from public.phone_host_presence presence
  join public.host_applications application
    on application.phone = presence.host_phone
   and application.status = 'approved'
  join public.phone_profiles profile
    on profile.phone = presence.host_phone
   and profile.gender = 'Female'
  where presence.last_seen_at > now() - interval '60 seconds'

  union all

  select
    'male_user'::text,
    profile.phone,
    profile.display_name,
    profile.username,
    presence.last_seen_at
  from public.phone_user_presence presence
  join public.phone_profiles profile
    on profile.phone = presence.phone
   and profile.gender = 'Male'
  left join public.phone_user_admin_status account
    on account.phone = profile.phone
  where presence.last_seen_at > now() - interval '60 seconds'
    and coalesce(account.status, 'active') = 'active'
  order by last_seen_at desc, display_name asc;
$$;

revoke all on function public.get_admin_online_presence()
  from public, anon, authenticated;
grant execute on function public.get_admin_online_presence()
  to service_role;

update public.app_policies_and_settings
set content = case
      when content @> '[{"title":"Online status"}]'::jsonb then content
      else content || jsonb_build_array(
        jsonb_build_object(
          'title', 'Online status',
          'description', 'While you use the app, we refresh a recent-activity timestamp to show your online status to authorised operations staff for service support and safety. We keep only the latest timestamp, not an activity history, and treat you as offline after about a minute without an update.'
        )
      )
    end,
    updated_at = now()
where key = 'privacy';

commit;
