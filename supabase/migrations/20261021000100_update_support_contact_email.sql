begin;

update public.app_policies_and_settings
set content = replace(content::text, 'support@aasaitalk.app', 'antony.ccspl@gmail.com')::jsonb,
    updated_at = now()
where key in ('privacy', 'terms', 'community', 'safety', 'refund')
  and content::text like '%support@aasaitalk.app%';

update public.app_policies_and_settings
set content = jsonb_set(
      content,
      '{support_email}',
      to_jsonb('antony.ccspl@gmail.com'::text),
      true
    ),
    updated_at = now()
where key = 'app_config'
  and content ->> 'support_email' is distinct from 'antony.ccspl@gmail.com';

notify pgrst, 'reload schema';

commit;
