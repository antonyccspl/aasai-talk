begin;

-- Existing staff records retain their custom page list. Add Support for the
-- roles that are allowed to operate this new queue without changing any other
-- assigned pages.
update public.admin_roles
set page_access = case
  when page_access is null then page_access
  when role in ('super_admin', 'moderator', 'support') and not ('Support' = any(page_access))
    then array_append(page_access, 'Support')
  else page_access
end,
updated_at = now()
where role in ('super_admin', 'moderator', 'support');

commit;
