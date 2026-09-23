begin;

create or replace function public.clear_phone_call_pair(
  input_caller_phone text,
  input_host_phone text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleared integer;
begin
  if input_caller_phone !~ '^\+91[0-9]{10}$'
     or input_host_phone !~ '^\+91[0-9]{10}$'
     or input_caller_phone = input_host_phone then
    raise exception 'Invalid call pair';
  end if;

  update public.call_sessions
  set status = 'cancelled',
      ended_at = now(),
      duration_seconds = 0
  where caller_phone = input_caller_phone
    and host_phone = input_host_phone
    and status in ('ringing', 'connected');

  get diagnostics cleared = row_count;
  return cleared;
end;
$$;

revoke all on function public.clear_phone_call_pair(text, text) from public;
grant execute on function public.clear_phone_call_pair(text, text) to anon, authenticated;

commit;
