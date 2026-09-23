begin;

create table if not exists public.phone_messages (
  id uuid primary key default gen_random_uuid(),
  sender_phone text not null references public.phone_identities(phone),
  recipient_phone text not null references public.phone_identities(phone),
  text text not null check (char_length(trim(text)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists phone_messages_conversation_idx
  on public.phone_messages(sender_phone, recipient_phone, created_at asc);

alter table public.phone_messages enable row level security;
alter table public.phone_messages replica identity full;
revoke all on public.phone_messages from public, anon, authenticated;
grant select, insert on public.phone_messages to anon, authenticated;

drop policy if exists phone_messages_read on public.phone_messages;
drop policy if exists phone_messages_insert on public.phone_messages;
create policy phone_messages_read on public.phone_messages
  for select to anon, authenticated using (true);
create policy phone_messages_insert on public.phone_messages
  for insert to anon, authenticated with check (true);

alter publication supabase_realtime add table public.phone_messages;

create or replace function public.get_phone_messages(
  input_phone text,
  input_other_phone text
)
returns setof public.phone_messages
language sql
security definer
set search_path = ''
as $$
  select *
  from public.phone_messages
  where (sender_phone = input_phone and recipient_phone = input_other_phone)
     or (sender_phone = input_other_phone and recipient_phone = input_phone)
  order by created_at asc
  limit 200;
$$;

revoke all on function public.get_phone_messages(text, text) from public;
grant execute on function public.get_phone_messages(text, text) to anon, authenticated;

create or replace function public.send_phone_message(
  input_sender_phone text,
  input_recipient_phone text,
  input_text text
)
returns public.phone_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_row public.phone_messages;
begin
  if input_sender_phone !~ '^\+91[0-9]{10}$'
     or input_recipient_phone !~ '^\+91[0-9]{10}$'
     or input_sender_phone = input_recipient_phone
     or char_length(trim(input_text)) not between 1 and 4000 then
    raise exception 'Invalid message';
  end if;

  insert into public.phone_messages(sender_phone, recipient_phone, text)
  values (input_sender_phone, input_recipient_phone, trim(input_text))
  returning * into message_row;
  return message_row;
end;
$$;

revoke all on function public.send_phone_message(text, text, text) from public;
grant execute on function public.send_phone_message(text, text, text) to anon, authenticated;

commit;
