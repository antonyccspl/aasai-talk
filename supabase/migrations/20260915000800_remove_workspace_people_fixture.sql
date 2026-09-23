-- People are sourced exclusively from public.directory_profiles.
begin;
update demo_private.templates
set payload = payload - 'people'
where id = 'default';

create or replace function public.open_demo_workspace(workspace_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare template jsonb; result jsonb; token_key text;
begin
  if workspace_token is null or workspace_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid workspace token'; end if;
  token_key := encode(extensions.digest(workspace_token, 'sha256'), 'hex');
  select payload into template from demo_private.templates where id = 'default';
  insert into demo_private.workspaces(token_hash, state) values (token_key, template->'state')
    on conflict do nothing;
  select jsonb_build_object('state', state, 'revision', revision)
    into result from demo_private.workspaces where token_hash = token_key;
  return result;
end;
$$;
commit;
