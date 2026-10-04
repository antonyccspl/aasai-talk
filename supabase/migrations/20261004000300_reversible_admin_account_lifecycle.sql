begin;

alter table public.phone_user_admin_status
  drop constraint if exists phone_user_admin_status_status_check;
alter table public.phone_user_admin_status
  add constraint phone_user_admin_status_status_check
  check (status in ('active', 'suspended', 'inactive', 'archived'));
alter table public.phone_user_admin_status
  add column if not exists archived_at timestamptz;

alter table public.host_applications
  drop constraint if exists host_applications_status_check;
alter table public.host_applications
  add constraint host_applications_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected', 'inactive', 'archived'));
alter table public.host_applications
  add column if not exists archived_at timestamptz;

commit;
