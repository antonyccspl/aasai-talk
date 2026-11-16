begin;

drop function if exists public.get_host_male_members();

create function public.get_host_male_members()
returns table (
  member_phone text,
  display_name text,
  avatar_url text,
  member_age smallint,
  member_city text,
  member_languages text[],
  member_interests text[],
  member_bio text,
  availability text,
  available_coins numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_digits text;
  viewer_phone text;
begin
  verified_digits := pg_catalog.regexp_replace(
    coalesce(auth.jwt() ->> 'phone', ''),
    '[^0-9]',
    '',
    'g'
  );
  if length(verified_digits) = 10 then
    verified_digits := '91' || verified_digits;
  end if;
  if verified_digits !~ '^91[0-9]{10}$' then
    raise exception 'An approved Host account is required';
  end if;

  viewer_phone := '+' || verified_digits;
  if not public.phone_auth_matches(viewer_phone)
     or not exists (
       select 1
       from public.phone_profiles host_profile
       join public.host_applications application
         on application.phone = host_profile.phone
        and application.status = 'approved'
       where host_profile.phone = viewer_phone
         and host_profile.gender = 'Female'
     ) then
    raise exception 'An approved Host account is required';
  end if;

  return query
  select
    profile.phone,
    coalesce(nullif(trim(profile.display_name), ''), 'Member'),
    profile.avatar_url,
    extract(year from age(current_date, profile.date_of_birth))::smallint,
    profile.city,
    profile.languages,
    profile.interests,
    profile.bio,
    case
      when exists (
        select 1
        from public.call_sessions call
        where profile.phone in (call.caller_phone, call.host_phone)
          and (
            call.status = 'connected'
            or (
              call.status = 'ringing'
              and call.created_at >= now() - interval '60 seconds'
            )
          )
      ) then 'Busy'
      when presence.last_seen_at > now() - interval '60 seconds'
        then 'Available'
      else 'Offline'
    end,
    coalesce(wallet.coins, 0)::numeric(12, 1)
  from public.phone_profiles profile
  join public.phone_identities identity
    on identity.phone = profile.phone and identity.profile_complete
  left join public.phone_user_presence presence
    on presence.phone = profile.phone
  left join public.phone_user_admin_status account
    on account.phone = profile.phone
  left join public.phone_wallets wallet on wallet.phone = profile.phone
  where profile.gender = 'Male'
    and extract(year from age(current_date, profile.date_of_birth))
      between 18 and 120
    and coalesce(account.status, 'active') = 'active'
    and not exists (
      select 1
      from public.phone_user_blocks block
      where (block.blocker_phone = viewer_phone and block.blocked_phone = profile.phone)
         or (block.blocker_phone = profile.phone and block.blocked_phone = viewer_phone)
    )
  order by
    case
      when presence.last_seen_at > now() - interval '60 seconds' then 0
      else 1
    end,
    presence.last_seen_at desc nulls last,
    profile.display_name asc;
end;
$$;

revoke all on function public.get_host_male_members()
  from public, anon, authenticated;
grant execute on function public.get_host_male_members()
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
