begin;

update public.app_policies_and_settings
set content = replace(
      replace(
        replace(
          replace(
            replace(
              replace(content::text, 'antony.ccspl@gmail.com', 'https://www.instagram.com/aasai_talk/'),
              'support@aasaitalk.app', 'https://www.instagram.com/aasai_talk/'
            ),
            '+91 6383739641', 'https://www.instagram.com/aasai_talk/'
          ),
          '+916383739641', 'https://www.instagram.com/aasai_talk/'
        ),
        '63837 39641', 'https://www.instagram.com/aasai_talk/'
      ),
      '6383739641', 'https://www.instagram.com/aasai_talk/'
    )::jsonb,
    updated_at = now()
where category = 'policy'
  and (
    content::text ilike '%antony.ccspl@gmail.com%'
    or content::text ilike '%support@aasaitalk.app%'
    or content::text like '%6383739641%'
    or content::text like '%63837 39641%'
  );

update public.app_policies_and_settings
set content = (content - 'support_email' - 'support_phone')
      || jsonb_build_object(
        'support_instagram', 'https://www.instagram.com/aasai_talk/'
      ),
    updated_at = now()
where key = 'app_config'
  and category = 'setting';

notify pgrst, 'reload schema';
commit;
