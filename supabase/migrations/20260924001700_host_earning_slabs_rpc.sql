begin;

create or replace function public.get_host_earning_slabs()
returns table (min_minutes integer, max_minutes integer, audio_paise_per_minute integer, video_paise_per_minute integer)
language sql stable security definer set search_path = ''
as $$
  values
    (0, 15, 200, 400),
    (15, 45, 300, 600),
    (45, null::integer, 400, 800);
$$;

revoke all on function public.get_host_earning_slabs() from public;
grant execute on function public.get_host_earning_slabs() to anon, authenticated;

commit;
