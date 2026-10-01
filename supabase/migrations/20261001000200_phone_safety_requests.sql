begin;

alter table public.safety_reports
  add column if not exists reporter_phone text
  references public.phone_identities(phone) on delete set null;

create table if not exists public.phone_user_blocks (
  blocker_phone text not null references public.phone_identities(phone) on delete cascade,
  blocked_phone text not null references public.phone_identities(phone) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_phone, blocked_phone),
  check (blocker_phone <> blocked_phone)
);

create index if not exists phone_user_blocks_reverse_idx
  on public.phone_user_blocks(blocked_phone, blocker_phone);

create table if not exists public.phone_account_deletion_requests (
  phone text primary key references public.phone_identities(phone) on delete cascade,
  reason text not null check (reason in (
    'Asked for money', 'Not interested', 'Unable to hear',
    'Buddy not polite', 'Abusive language', 'Others'
  )),
  details text not null default '' check (length(details) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '15 days'),
  check (reason <> 'Others' or length(trim(details)) > 0)
);

alter table public.phone_user_blocks enable row level security;
alter table public.phone_account_deletion_requests enable row level security;
revoke all on public.phone_user_blocks, public.phone_account_deletion_requests
  from public, anon, authenticated;
grant all on public.phone_user_blocks, public.phone_account_deletion_requests
  to service_role;

drop policy if exists phone_messages_read on public.phone_messages;
drop policy if exists phone_messages_insert on public.phone_messages;
revoke all on public.phone_messages from public, anon, authenticated;
grant all on public.phone_messages to service_role;

drop policy if exists public_safety_reports on public.safety_reports;
revoke all on public.safety_reports from public, anon, authenticated;
grant all on public.safety_reports to service_role;

create or replace function public.get_phone_conversations(input_phone text)
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
      case when message.sender_phone = input_phone then message.recipient_phone else message.sender_phone end as other_phone,
      message.text,
      message.created_at,
      row_number() over (
        partition by case when message.sender_phone = input_phone then message.recipient_phone else message.sender_phone end
        order by message.created_at desc
      ) as position
    from public.phone_messages message
    where message.sender_phone = input_phone or message.recipient_phone = input_phone
  ), last_messages as (
    select * from ranked where position = 1
  )
  select
    message.other_phone,
    message.text,
    message.created_at,
    coalesce(nullif(profile.username, ''), 'Caller'),
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
  where not exists (
    select 1 from public.phone_user_blocks block
    where (block.blocker_phone = input_phone and block.blocked_phone = message.other_phone)
       or (block.blocker_phone = message.other_phone and block.blocked_phone = input_phone)
  )
  order by message.created_at desc;
$$;

create or replace function public.get_phone_messages(
  input_phone text,
  input_other_phone text
)
returns setof public.phone_messages
language sql
security definer
set search_path = ''
as $$
  select message.*
  from public.phone_messages message
  where ((message.sender_phone = input_phone and message.recipient_phone = input_other_phone)
      or (message.sender_phone = input_other_phone and message.recipient_phone = input_phone))
    and not exists (
    select 1 from public.phone_user_blocks block
    where (block.blocker_phone = input_phone and block.blocked_phone = input_other_phone)
       or (block.blocker_phone = input_other_phone and block.blocked_phone = input_phone)
  );
$$;

create or replace function public.send_phone_message(
  input_sender_phone text,
  input_recipient_phone text,
  input_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_row public.phone_messages;
  sender_wallet public.phone_wallets;
  sender_is_male boolean;
  sender_is_approved_host boolean;
  message_coin_cost constant bigint := 1;
begin
  if input_sender_phone !~ '^[+]91[0-9]{10}$'
     or input_recipient_phone !~ '^[+]91[0-9]{10}$'
     or input_sender_phone = input_recipient_phone
     or char_length(trim(input_text)) not between 1 and 500 then
    raise exception 'Invalid message';
  end if;
  if exists (
    select 1 from public.phone_user_blocks block
    where (block.blocker_phone = input_sender_phone and block.blocked_phone = input_recipient_phone)
       or (block.blocker_phone = input_recipient_phone and block.blocked_phone = input_sender_phone)
  ) then raise exception 'Messaging is unavailable for this conversation'; end if;

  select exists (
    select 1 from public.phone_profiles
    where phone = input_sender_phone and gender = 'Male'
  ) into sender_is_male;
  select exists (
    select 1 from public.phone_profiles profile
    join public.host_applications application on application.phone = profile.phone
    where profile.phone = input_sender_phone
      and profile.gender = 'Female'
      and application.status = 'approved'
  ) into sender_is_approved_host;

  if sender_is_male and not exists (
    select 1 from public.phone_profiles profile
    join public.host_applications application on application.phone = profile.phone
    where profile.phone = input_recipient_phone
      and profile.gender = 'Female'
      and application.status = 'approved'
  ) then
    raise exception 'Messages can only be sent to an approved Host';
  elsif sender_is_approved_host and not exists (
    select 1 from public.phone_profiles
    where phone = input_recipient_phone and gender = 'Male'
  ) then
    raise exception 'Hosts can only message male users';
  elsif not sender_is_male and not sender_is_approved_host then
    raise exception 'Messaging is only available between a male user and an approved Host';
  end if;

  insert into public.phone_wallets(phone)
  values (input_sender_phone), (input_recipient_phone)
  on conflict (phone) do nothing;
  select * into sender_wallet from public.phone_wallets
  where phone = input_sender_phone for update;
  if sender_is_male and sender_wallet.coins < message_coin_cost then
    raise exception 'Insufficient coins to send message';
  end if;
  if sender_is_male then
    update public.phone_wallets
    set coins = coins - message_coin_cost, updated_at = now()
    where phone = input_sender_phone;
  end if;
  insert into public.phone_messages(sender_phone, recipient_phone, text)
  values (input_sender_phone, input_recipient_phone, trim(input_text))
  returning * into message_row;
  if sender_is_male then
    insert into public.phone_message_wallet_ledger(phone, message_id, coin_delta)
    values (input_sender_phone, message_row.id, -message_coin_cost);
  end if;
  return jsonb_build_object(
    'message', to_jsonb(message_row),
    'coins_charged', case when sender_is_male then message_coin_cost else 0 end,
    'remaining_coins', sender_wallet.coins - case when sender_is_male then message_coin_cost else 0 end
  );
end;
$$;

create or replace function public.start_phone_call(
  input_caller_phone text,
  input_host_phone text,
  input_call_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.call_sessions;
  application jsonb;
begin
  if input_caller_phone is null or input_host_phone is null
     or input_caller_phone = input_host_phone
     or input_caller_phone !~ '^[+]91[0-9]{10}$'
     or input_host_phone !~ '^[+]91[0-9]{10}$'
     or input_call_type not in ('audio', 'video') then
    raise exception 'Invalid call request';
  end if;
  if exists (
    select 1 from public.phone_user_blocks block
    where (block.blocker_phone = input_caller_phone and block.blocked_phone = input_host_phone)
       or (block.blocker_phone = input_host_phone and block.blocked_phone = input_caller_phone)
  ) then raise exception 'Calls are unavailable for this connection'; end if;

  if not exists (
    select 1 from public.phone_identities identity
    left join public.phone_profiles profile on profile.phone = identity.phone
    where identity.phone = input_caller_phone and identity.profile_complete
      and coalesce(profile.gender, identity.profile ->> 'gender') = 'Male'
  ) then raise exception 'Only male users can start Host calls'; end if;

  select host.application_profile into application
  from public.phone_profiles profile
  join public.host_applications host on host.phone = profile.phone
  where profile.phone = input_host_phone and profile.gender = 'Female' and host.status = 'approved';
  if not found then raise exception 'The selected user is not an approved Host'; end if;
  if not coalesce((application ->> input_call_type)::boolean, false) then
    raise exception 'This Host does not accept % calls', input_call_type;
  end if;

  update public.call_sessions set status = 'cancelled', ended_at = now(), duration_seconds = 0
  where caller_phone = input_caller_phone and status = 'ringing';
  if exists (
    select 1 from public.call_sessions
    where (caller_phone = input_caller_phone or host_phone = input_caller_phone)
      and status = 'connected'
  ) then raise exception 'You already have an active call'; end if;

  insert into public.call_sessions (caller_phone, host_phone, call_type, status, room_id)
  values (input_caller_phone, input_host_phone, input_call_type, 'ringing',
    'aasai-' || replace(gen_random_uuid()::text, '-', ''))
  returning * into session_row;
  return jsonb_build_object('id', session_row.id, 'room_id', session_row.room_id,
    'status', session_row.status, 'call_type', session_row.call_type);
end;
$$;

create or replace function public.get_incoming_phone_call(input_phone text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', call.id,
    'caller_phone', call.caller_phone,
    'caller_username', coalesce(nullif(caller.username, ''), 'Caller'),
    'call_type', call.call_type,
    'room_id', call.room_id
  )
  from public.call_sessions call
  left join public.phone_profiles caller on caller.phone = call.caller_phone
  where call.host_phone = input_phone
    and call.status = 'ringing'
    and call.created_at >= now() - interval '60 seconds'
    and not exists (
      select 1 from public.phone_user_blocks block
      where (block.blocker_phone = call.host_phone and block.blocked_phone = call.caller_phone)
         or (block.blocker_phone = call.caller_phone and block.blocked_phone = call.host_phone)
    )
  order by call.created_at desc
  limit 1;
$$;

revoke all on function public.get_phone_messages(text, text),
  public.send_phone_message(text, text, text),
  public.start_phone_call(text, text, text),
  public.get_incoming_phone_call(text)
  from public;
grant execute on function public.get_phone_messages(text, text),
  public.send_phone_message(text, text, text),
  public.start_phone_call(text, text, text),
  public.get_incoming_phone_call(text)
  to anon, authenticated;

create or replace function public.get_phone_unread_message_count(input_phone text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select count(*)
  from public.phone_messages message
  where message.recipient_phone = input_phone
    and message.read_at is null
    and not exists (
      select 1 from public.phone_user_blocks block
      where (block.blocker_phone = input_phone and block.blocked_phone = message.sender_phone)
         or (block.blocker_phone = message.sender_phone and block.blocked_phone = input_phone)
    );
$$;

create or replace function public.get_phone_message_notifications(input_phone text)
returns table (
  id uuid,
  sender_phone text,
  text text,
  created_at timestamptz,
  read_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select message.id, message.sender_phone, message.text, message.created_at, message.read_at
  from public.phone_messages message
  where message.recipient_phone = input_phone
    and not exists (
      select 1 from public.phone_user_blocks block
      where (block.blocker_phone = input_phone and block.blocked_phone = message.sender_phone)
         or (block.blocker_phone = message.sender_phone and block.blocked_phone = input_phone)
    )
  order by message.created_at desc
  limit 100;
$$;

revoke all on function public.get_phone_unread_message_count(text),
  public.get_phone_message_notifications(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_unread_message_count(text),
  public.get_phone_message_notifications(text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;