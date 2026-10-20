begin;

update public.admin_roles
set page_access = array_append(page_access, 'Account deletions'),
    updated_at = now()
where role = 'support'
  and page_access is not null
  and 'Users' = any(page_access)
  and not ('Account deletions' = any(page_access));

commit;
