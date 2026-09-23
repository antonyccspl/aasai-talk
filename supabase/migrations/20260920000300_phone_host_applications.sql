begin;

alter table public.host_applications
  alter column user_id drop not null;

alter table public.host_applications
  add column if not exists phone text references public.phone_identities(phone),
  add column if not exists application_profile jsonb not null default '{}'::jsonb;

create unique index if not exists host_applications_phone_unique
  on public.host_applications(phone)
  where phone is not null;

create or replace function public.submit_phone_host_application(
  input_phone text,
  input_application jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_id uuid;
begin
  if input_phone is null or input_phone !~ '^\+91[0-9]{10}$'
     or input_application is null
     or jsonb_typeof(input_application) <> 'object' then
    raise exception 'Invalid host application data';
  end if;

  if not exists (
    select 1
    from public.phone_profiles
    where phone = input_phone and gender = 'Female'
  ) then
    raise exception 'Only completed female profiles can apply to become a host';
  end if;

  insert into public.host_applications (
    phone,
    status,
    application_profile,
    submitted_at
  )
  values (
    input_phone,
    'pending',
    input_application,
    now()
  )
  on conflict (phone) where phone is not null do update set
    status = 'pending',
    application_profile = excluded.application_profile,
    submitted_at = now(),
    reviewed_at = null,
    review_note = null
  returning id into application_id;

  return application_id;
end;
$$;

revoke all on function public.submit_phone_host_application(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_phone_host_application(text, jsonb)
  to anon, authenticated;

commit;
