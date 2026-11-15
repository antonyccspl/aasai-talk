begin;

do $$
declare
  function_signature text;
  function_oid regprocedure;
  function_definition text;
begin
  foreach function_signature in array array[
    'public.admin_create_instagram_host(text,jsonb,jsonb,text,text,text,text,jsonb,uuid,boolean,boolean)',
    'public.admin_assist_host_onboarding(text,jsonb,text,text,jsonb,uuid,boolean,boolean)'
  ]
  loop
    function_oid := pg_catalog.to_regprocedure(function_signature);
    if function_oid is null then
      raise exception 'Required Host onboarding function is missing: %', function_signature;
    end if;

    function_definition := pg_catalog.pg_get_functiondef(function_oid);
    if pg_catalog.strpos(function_definition, '{2,256}') = 0 then
      raise exception 'Expected UPI regex bound was not found in %', function_signature;
    end if;

    execute pg_catalog.replace(function_definition, '{2,256}', '{2,255}');
  end loop;
end;
$$;

commit;
