begin;

-- A visible, signed-in host acknowledges receipt independently of Web Push.
alter table public.call_sessions add column if not exists host_received_at timestamptz;

create or replace function public.acknowledge_phone_host_call(input_host_phone text, input_call_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.call_sessions
  set host_received_at = coalesce(host_received_at, now())
  where id = input_call_id and host_phone = input_host_phone
    and status = 'ringing' and created_at > now() - interval '60 seconds'
    and public.phone_host_is_online(input_host_phone);
  return found;
end;
$$;
revoke all on function public.acknowledge_phone_host_call(text,uuid) from public, anon, authenticated;
grant execute on function public.acknowledge_phone_host_call(text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
