begin;

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
    case
      when jsonb_typeof(ha.application_profile -> 'languages') = 'array'
        then array(select jsonb_array_elements_text(ha.application_profile -> 'languages'))
      else pp.languages
    end,
    case
      when jsonb_typeof(ha.application_profile -> 'interests') = 'array'
        then array(select jsonb_array_elements_text(ha.application_profile -> 'interests'))
      else pp.interests
    end,
    coalesce(ha.application_profile ->> 'bio', pp.bio),
    'Available',
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

drop function if exists public.get_phone_conversations(text);
create function public.get_phone_conversations(input_phone text)
returns table (
  other_phone text,
  last_text text,
  last_created_at timestamptz,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_is_host boolean
)
language sql
security definer
set search_path = ''
as $$
  with ranked as (
    select
      case when m.sender_phone = input_phone then m.recipient_phone else m.sender_phone end as other_phone,
      m.text,
      m.created_at,
      row_number() over (
        partition by case when m.sender_phone = input_phone then m.recipient_phone else m.sender_phone end
        order by m.created_at desc
      ) as position
    from public.phone_messages m
    where length(input_phone) = 13
      and left(input_phone, 3) = '+91'
      and substring(input_phone from 4) ~ '^[0-9]{10}$'
      and (m.sender_phone = input_phone or m.recipient_phone = input_phone)
  ), last_messages as (
    select * from ranked where position = 1
  )
  select
    message.other_phone,
    message.text,
    message.created_at,
    coalesce(nullif(profile.username, ''), 'member_' || substr(md5(message.other_phone), 1, 8)),
    case
      when requester_host.is_host and profile.gender = 'Male' then null
      when other_host.is_host then coalesce(nullif(trim(other_host.application_profile ->> 'name'), ''), profile.display_name)
      else profile.display_name
    end,
    case
      when requester_host.is_host and profile.gender = 'Male' then null
      when other_host.is_host then coalesce(nullif(trim(other_host.application_profile ->> 'photo'), ''), profile.avatar_url)
      else profile.avatar_url
    end,
    coalesce(other_host.is_host, false)
  from last_messages message
  left join public.phone_profiles profile on profile.phone = message.other_phone
  left join lateral (
    select true as is_host, application_profile
    from public.host_applications
    where phone = message.other_phone and status = 'approved'
    limit 1
  ) other_host on true
  cross join lateral (
    select exists (
      select 1 from public.host_applications
      where phone = input_phone and status = 'approved'
    ) as is_host
  ) requester_host
  order by message.created_at desc;
$$;

revoke all on function public.get_phone_conversations(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_conversations(text)
  to anon, authenticated;

create or replace function public.get_phone_host_dashboard(input_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if input_phone is null or length(input_phone) <> 13
      or left(input_phone, 3) <> '+91'
      or substring(input_phone from 4) !~ '^[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  return jsonb_build_object(
    'today_calls', (
      select count(*) from public.host_call_time_ledger
      where host_phone = input_phone and call_date = current_date
    ) + (
      select count(*) from public.call_sessions
      where host_phone = input_phone and status = 'connected' and connected_at >= current_date
    ),
    'today_seconds', coalesce((
      select sum(duration_seconds) from public.host_call_time_ledger
      where host_phone = input_phone and call_date = current_date
    ), 0) + coalesce((
      select sum(greatest(0, floor(extract(epoch from now() - connected_at))::integer))
      from public.call_sessions
      where host_phone = input_phone and status = 'connected' and connected_at >= current_date
    ), 0),
    'today_earnings_paise', coalesce((
      select sum(earnings_delta_paise) from public.phone_wallet_ledger
      where phone = input_phone and created_at >= current_date
    ), 0),
    'total_calls', (
      select count(*) from public.host_call_time_ledger where host_phone = input_phone
    ),
    'total_earnings_paise', coalesce((
      select earnings_paise from public.phone_wallets where phone = input_phone
    ), 0),
    'active_calls', (
      select count(*) from public.call_sessions where host_phone = input_phone and status = 'connected'
    ),
    'missed_calls', (
      select count(*) from public.call_sessions where host_phone = input_phone and status in ('missed', 'rejected')
    ),
    'recent_calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'caller_username', coalesce(nullif(caller.username, ''), 'member_' || substr(md5(recent.caller_phone), 1, 8)),
        'call_type', recent.call_type,
        'status', recent.status,
        'duration_seconds', recent.duration_seconds,
        'created_at', recent.created_at
      ) order by recent.created_at desc)
      from (
        select id, caller_phone, call_type, status, duration_seconds, created_at
        from public.call_sessions
        where host_phone = input_phone and status in ('ended', 'missed', 'rejected')
        order by created_at desc
        limit 5
      ) recent
      left join public.phone_profiles caller on caller.phone = recent.caller_phone
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_phone_host_dashboard(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_host_dashboard(text)
  to anon, authenticated;

create or replace function public.get_phone_call_summary(input_session_id uuid, input_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.call_sessions;
  counterpart public.phone_profiles;
  counterpart_application jsonb;
  counterpart_is_host boolean := false;
  viewer_is_host boolean := false;
  total_coins bigint;
  counterpart_phone text;
  counterpart_username text;
  counterpart_display_name text;
  counterpart_avatar_url text;
begin
  select * into call_row from public.call_sessions
  where id = input_session_id and input_phone in (caller_phone, host_phone);
  if not found then raise exception 'Call session not found'; end if;

  counterpart_phone := case when input_phone = call_row.caller_phone then call_row.host_phone else call_row.caller_phone end;
  viewer_is_host := input_phone = call_row.host_phone;
  select * into counterpart from public.phone_profiles where phone = counterpart_phone;
  select application_profile into counterpart_application
  from public.host_applications
  where phone = counterpart_phone and status = 'approved';
  counterpart_is_host := found;
  counterpart_username := coalesce(nullif(counterpart.username, ''), 'member_' || substr(md5(counterpart_phone), 1, 8));
  if viewer_is_host and counterpart.gender = 'Male' then
    counterpart_display_name := null;
    counterpart_avatar_url := null;
  elsif counterpart_is_host then
    counterpart_display_name := coalesce(nullif(trim(counterpart_application ->> 'name'), ''), counterpart.display_name);
    counterpart_avatar_url := coalesce(nullif(trim(counterpart_application ->> 'photo'), ''), counterpart.avatar_url);
  else
    counterpart_display_name := counterpart.display_name;
    counterpart_avatar_url := counterpart.avatar_url;
  end if;

  select coalesce(sum(charged), 0)::bigint into total_coins from (
    select -coin_delta as charged from public.phone_call_minute_ledger
      where call_session_id = input_session_id and phone = call_row.caller_phone
    union all
    select -coin_delta from public.phone_call_mode_switch_ledger
      where call_session_id = input_session_id and phone = call_row.caller_phone
    union all
    select -coin_delta from public.phone_wallet_ledger
      where call_session_id = input_session_id and phone = call_row.caller_phone
  ) charges;

  return jsonb_build_object(
    'id', call_row.id,
    'call_type', call_row.call_type,
    'status', call_row.status,
    'duration_seconds', call_row.duration_seconds,
    'coins_charged', total_coins,
    'connected', call_row.connected_at is not null,
    'counterpart_username', counterpart_username,
    'counterpart_display_name', counterpart_display_name,
    'counterpart_avatar_url', counterpart_avatar_url,
    'counterpart_is_host', counterpart_is_host
  );
end;
$$;

revoke all on function public.get_phone_call_summary(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_phone_call_summary(uuid, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;