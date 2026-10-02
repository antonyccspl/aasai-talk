-- Keep the live application configuration aligned with the Aasai Talk brand.
update public.app_policies_and_settings
set content = jsonb_set(
      content,
      '{support_email}',
      to_jsonb('support@aasaitalk.app'::text),
      true
    ),
    updated_at = now()
where key = 'app_config';
