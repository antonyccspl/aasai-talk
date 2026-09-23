begin;

alter table public.call_sessions replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.call_sessions;
exception when duplicate_object then null;
end $$;

commit;
