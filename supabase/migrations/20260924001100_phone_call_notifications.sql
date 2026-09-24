begin;

create or replace function public.get_phone_call_notifications(input_phone text)
returns table (id uuid, other_phone text, call_type text, status text, created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if input_phone !~ '^\+91[0-9]{10}$' then raise exception 'Invalid phone'; end if;
  return query
  select c.id,
    case when c.caller_phone = input_phone then c.host_phone else c.caller_phone end,
    c.call_type, c.status, c.created_at
  from public.call_sessions c
  where (c.caller_phone = input_phone or c.host_phone = input_phone)
    and c.status in ('missed', 'rejected')
  order by c.created_at desc limit 50;
end;
$$;

revoke all on function public.get_phone_call_notifications(text) from public;
grant execute on function public.get_phone_call_notifications(text) to anon, authenticated;

commit;
