begin;

do $$
declare
  function_signature constant text :=
    'public.admin_update_host_details(text,jsonb,jsonb,jsonb,jsonb,jsonb,text,uuid)';
  function_oid regprocedure;
  function_definition text;
begin
  function_oid := pg_catalog.to_regprocedure(function_signature);
  if function_oid is null then
    raise exception 'Required Host editor function is missing: %', function_signature;
  end if;

  function_definition := pg_catalog.pg_get_functiondef(function_oid);
  if pg_catalog.strpos(function_definition, '{2,256}') = 0 then
    raise exception 'Expected UPI regex bound was not found in %', function_signature;
  end if;

  execute pg_catalog.replace(function_definition, '{2,256}', '{2,255}');

  if 'namw@bank' !~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9._-]{1,64}$' then
    raise exception 'The corrected UPI validation pattern rejected a valid address';
  end if;
end;
$$;

commit;
