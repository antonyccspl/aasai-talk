begin;

do $$
declare
  function_oid regprocedure;
  function_definition text;
  old_order constant text := 'order by 3 asc, 2 asc;';
  new_order constant text :=
    'order by case when presence.show_last_seen and presence.last_seen_at > timestamptz ''2000-01-01'' then presence.last_seen_at else null end desc nulls last, 2 asc;';
begin
  function_oid := pg_catalog.to_regprocedure(
    'public.get_public_directory_profiles()'
  );
  if function_oid is null then
    raise exception 'Host directory function is missing.';
  end if;

  function_definition := pg_catalog.pg_get_functiondef(function_oid);
  if pg_catalog.strpos(function_definition, old_order) = 0 then
    raise exception 'Expected age-based Host directory ordering was not found.';
  end if;

  execute pg_catalog.replace(function_definition, old_order, new_order);

  function_definition := pg_catalog.pg_get_functiondef(function_oid);
  if pg_catalog.strpos(function_definition, new_order) = 0 then
    raise exception 'The Host directory activity ordering was not installed.';
  end if;
end;
$$;

commit;
