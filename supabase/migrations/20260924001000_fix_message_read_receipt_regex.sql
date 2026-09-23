-- Fix: double-escaped backslashes in phone regex patterns.
-- The original 20260924000900 migration used '^\\+91...' (two backslashes)
-- inside $$ dollar-quoted blocks, where backslashes are literal.
-- This made the regex expect a literal '\' before '+91', rejecting every
-- valid phone number like '+919876543210'.
-- All other migrations correctly use a single backslash: '^\+91...'

begin;

create or replace function public.get_phone_unread_message_count(input_phone text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone !~ '^\+91[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  return (
    select count(*)
    from public.phone_messages
    where recipient_phone = input_phone
      and read_at is null
  );
end;
$$;

create or replace function public.get_phone_message_notifications(input_phone text)
returns table (
  id uuid,
  sender_phone text,
  text text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_phone !~ '^\+91[0-9]{10}$' then
    raise exception 'Invalid phone';
  end if;

  return query
  select m.id, m.sender_phone, m.text, m.created_at, m.read_at
  from public.phone_messages m
  where m.recipient_phone = input_phone
  order by m.created_at desc
  limit 100;
end;
$$;

create or replace function public.mark_phone_conversation_read(
  input_phone text,
  input_other_phone text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if input_phone !~ '^\+91[0-9]{10}$'
     or input_other_phone !~ '^\+91[0-9]{10}$'
     or input_phone = input_other_phone then
    raise exception 'Invalid phone';
  end if;

  update public.phone_messages
  set read_at = now()
  where recipient_phone = input_phone
    and sender_phone = input_other_phone
    and read_at is null;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

commit;
