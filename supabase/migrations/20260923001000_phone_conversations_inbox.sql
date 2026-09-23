begin;

create or replace function public.get_phone_conversations(input_phone text)
returns table (
  other_phone text,
  last_text text,
  last_created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with ranked as (
    select
      case when sender_phone = input_phone then recipient_phone else sender_phone end as other_phone,
      text,
      created_at,
      row_number() over (
        partition by case when sender_phone = input_phone then recipient_phone else sender_phone end
        order by created_at desc
      ) as position
    from public.phone_messages
    where sender_phone = input_phone or recipient_phone = input_phone
  )
  select other_phone, text, created_at
  from ranked
  where position = 1
  order by created_at desc;
$$;

revoke all on function public.get_phone_conversations(text)
  from public, anon, authenticated;
grant execute on function public.get_phone_conversations(text)
  to anon, authenticated;

commit;
