begin;

alter table public.admin_roles
  add column if not exists page_access text[] not null default '{}';

commit;
