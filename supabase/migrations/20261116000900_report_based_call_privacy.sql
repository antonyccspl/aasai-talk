begin;

update public.app_policies_and_settings as settings
set content = (
  select jsonb_agg(
    case
      when section.value ->> 'title' = 'Messages, calls, and safety'
        then jsonb_set(
          section.value,
          '{description}',
          to_jsonb(
            'We store messages to deliver chats and show conversation history. The Admin Portal does not provide routine browsing of private chats; authorized safety moderators can review report details and any message text you choose to include when investigating a report. One-to-one audio and video calls are live and are not recorded or stored by Aasai Talk. We retain limited call metadata needed to operate calls, manage charges, and investigate reports.'::text
          ),
          true
        )
      else section.value
    end
    order by section.ordinality
  )
  from jsonb_array_elements(settings.content) with ordinality as section(value, ordinality)
),
    updated_at = now()
where settings.key = 'privacy'
  and settings.category = 'policy'
  and jsonb_typeof(settings.content) = 'array'
  and settings.content @> '[{"title":"Messages, calls, and safety"}]'::jsonb;

update public.app_policies_and_settings as settings
set content = (
  select jsonb_agg(
    case
      when section.value ->> 'title' = 'Content and safety checks'
        then jsonb_set(
          section.value,
          '{description}',
          to_jsonb(
            'Nudity, sexually explicit content, exploitation, and illegal or harmful content are not allowed. Profile photos may be reviewed for safety. One-to-one audio and video calls are not recorded or stored. We may review details submitted with safety reports and take action when our rules are broken.'::text
          ),
          true
        )
      else section.value
    end
    order by section.ordinality
  )
  from jsonb_array_elements(settings.content) with ordinality as section(value, ordinality)
),
    updated_at = now()
where settings.key = 'terms'
  and settings.category = 'policy'
  and jsonb_typeof(settings.content) = 'array'
  and settings.content @> '[{"title":"Content and safety checks"}]'::jsonb;

update public.app_policies_and_settings as settings
set content = (
  select jsonb_agg(
    case
      when section.value ->> 'title' = 'Report a concern'
        then jsonb_set(
          section.value,
          '{description}',
          to_jsonb(
            'Use the report option on a profile, chat, or call to tell us about harassment, scams, threats, impersonation, or inappropriate content. Authorized safety moderators review the details you submit. Include only relevant message text or call details; Aasai Talk does not record one-to-one audio or video calls.'::text
          ),
          true
        )
      else section.value
    end
    order by section.ordinality
  )
  from jsonb_array_elements(settings.content) with ordinality as section(value, ordinality)
),
    updated_at = now()
where settings.key = 'safety'
  and settings.category = 'policy'
  and jsonb_typeof(settings.content) = 'array'
  and settings.content @> '[{"title":"Report a concern"}]'::jsonb;

commit;
