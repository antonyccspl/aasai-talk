begin;

-- Use explicit country-code and digit checks. The prior regular expression
-- was double-escaped, so a valid +91 identity could be rejected on the calls screen.
create or replace function public.get_phone_call_history(
  input_phone text,
  input_limit integer default 50
)
returns table(
  id uuid, other_phone text, call_type text, status text, duration_seconds integer,
  incoming boolean, created_at timestamptz, counterpart_username text,
  counterpart_display_name text, counterpart_avatar_url text, counterpart_is_host boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  if input_phone is null or length(input_phone) <> 13
    or left(input_phone, 3) <> '+91'
    or substring(input_phone from 4) !~ '^[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  return query
  select recent.id,
    case when recent.incoming then recent.caller_phone else recent.host_phone end,
    recent.call_type, recent.status, recent.duration_seconds, recent.incoming, recent.created_at,
    coalesce(nullif(profile.username, ''), 'member_' || substr(md5(profile.phone), 1, 8)),
    case when recent.incoming and profile.gender = 'Male' then null
      when application.phone is not null then coalesce(nullif(trim(application.application_profile ->> 'name'), ''), profile.display_name)
      else profile.display_name end,
    case when recent.incoming and profile.gender = 'Male' then null
      when application.phone is not null then coalesce(nullif(trim(application.application_profile ->> 'photo'), ''), profile.avatar_url)
      else profile.avatar_url end,
    application.phone is not null
  from (
    select c.*, c.host_phone = input_phone as incoming
    from public.call_sessions c
    where input_phone in (c.caller_phone, c.host_phone)
      and c.status in ('ended', 'missed', 'rejected', 'cancelled')
    order by c.created_at desc
    limit least(greatest(coalesce(input_limit, 50), 1), 100)
  ) recent
  join public.phone_profiles profile
    on profile.phone = case when recent.incoming then recent.caller_phone else recent.host_phone end
  left join public.host_applications application
    on application.phone = profile.phone and application.status = 'approved'
  order by recent.created_at desc;
end;
$$;

revoke all on function public.get_phone_call_history(text, integer) from public;
grant execute on function public.get_phone_call_history(text, integer) to anon, authenticated;
notify pgrst, 'reload schema';

commit;
