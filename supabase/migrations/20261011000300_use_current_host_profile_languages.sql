begin;

-- A host can edit her profile after her application has been approved. The
-- application JSON is an approval snapshot, so the public directory must use
-- the current profile languages rather than that stale snapshot.
create or replace function public.get_public_directory_profiles()
returns table (
  id text,
  display_name text,
  age smallint,
  gender text,
  city text,
  languages text[],
  interests text[],
  bio text,
  availability text,
  avatar_url text,
  accent_color text
)
language sql
security definer
set search_path = ''
as $$
  select
    'phone_' || replace(replace(replace(pp.phone, '+', ''), ' ', ''), '-', ''),
    coalesce(nullif(trim(ha.application_profile ->> 'name'), ''), pp.display_name),
    extract(year from age(current_date, pp.date_of_birth))::smallint,
    pp.gender,
    pp.city,
    pp.languages,
    case
      when jsonb_typeof(ha.application_profile -> 'interests') = 'array'
        then array(select jsonb_array_elements_text(ha.application_profile -> 'interests'))
      else pp.interests
    end,
    coalesce(ha.application_profile ->> 'bio', pp.bio),
    case
      when exists (
        select 1
        from public.call_sessions call
        where call.host_phone = pp.phone
          and (
            call.status = 'connected'
            or (call.status = 'ringing' and call.created_at >= now() - interval '60 seconds')
          )
      ) then 'Busy'
      when exists (
        select 1
        from public.phone_host_presence presence
        where presence.host_phone = pp.phone
          and presence.last_seen_at > now() - interval '60 seconds'
      ) then 'Available'
      else 'Offline'
    end,
    coalesce(nullif(trim(ha.application_profile ->> 'photo'), ''), pp.avatar_url),
    '#285647'
  from public.phone_profiles pp
  join public.host_applications ha on ha.phone = pp.phone
  where ha.status = 'approved'
    and pp.gender = 'Female'
    and pp.date_of_birth is not null
    and extract(year from age(current_date, pp.date_of_birth)) between 18 and 120
  order by 3 asc, 2 asc;
$$;

revoke all on function public.get_public_directory_profiles()
  from public, anon, authenticated;
grant execute on function public.get_public_directory_profiles()
  to anon, authenticated;

commit;
