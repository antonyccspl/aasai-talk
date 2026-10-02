-- Replace legacy Talkative copy with concise, current Aasai Talk policy content.
-- The app reads these sections live from app_policies_and_settings on mobile and web.

insert into public.app_policies_and_settings (key, title, category, content, updated_at)
values
  (
    'privacy',
    'Privacy Policy',
    'policy',
    $json$[
      {"title":"Information we use","description":"Aasai Talk uses your phone number to sign you in and your profile details, messages, and call metadata to provide the service and keep accounts safe."},
      {"title":"Calls and messages","description":"Calls are delivered in real time. We retain only the information needed to operate the service, resolve problems, prevent abuse, and meet legal obligations."},
      {"title":"How data is protected","description":"Access is limited to authorised systems and service providers that help us operate Aasai Talk. We do not sell your personal information."},
      {"title":"Your choices","description":"You can update your profile, block people, report concerns, and request account deletion from the app. Some records may be kept when required for security, fraud prevention, or law."}
    ]$json$::jsonb,
    now()
  ),
  (
    'terms',
    'Terms and Conditions',
    'policy',
    $json$[
      {"title":"Who can use Aasai Talk","description":"You must be at least 18 years old and provide accurate account information. Keep your sign-in code private and do not share your account."},
      {"title":"Use the service respectfully","description":"Use Aasai Talk only for lawful, respectful communication. Do not impersonate others, scam people, spam, harass, threaten, or share prohibited content."},
      {"title":"Calls, coins, and payments","description":"Any paid features are shown before you confirm them. Prices, availability, and call quality can vary with your network and the services you use."},
      {"title":"Enforcement","description":"We may limit, suspend, or remove accounts that break these terms or create a safety risk. You can report a decision or safety concern through in-app support."}
    ]$json$::jsonb,
    now()
  ),
  (
    'safety',
    'Safety Center',
    'policy',
    $json$[
      {"title":"Protect your personal information","description":"Never send OTPs, passwords, bank details, identity documents, or money to someone you meet on Aasai Talk. Be careful with links and requests to move conversations elsewhere."},
      {"title":"Set your boundaries","description":"You can end a call, stop replying, block a person, or report them at any time. Consent matters in every conversation and can be withdrawn at any time."},
      {"title":"Report abuse","description":"Report harassment, impersonation, scams, threats, or inappropriate content from the relevant profile, chat, or call screen. Include useful details so our team can review it."},
      {"title":"Get urgent help","description":"Aasai Talk is not an emergency service. If you feel in immediate danger, contact local emergency services or a trusted person first, then report the account in the app."}
    ]$json$::jsonb,
    now()
  ),
  (
    'community',
    'Community Guidelines',
    'policy',
    $json$[
      {"title":"Be respectful","description":"Treat every person with dignity. Ask before discussing sensitive topics, respect a no, and do not pressure anyone to call, chat, or share personal details."},
      {"title":"Keep the community safe","description":"Harassment, hate, sexual exploitation, threats, fraud, doxxing, and sharing another person’s private content are not allowed."},
      {"title":"Be genuine","description":"Use your own identity and photos. Do not pretend to be another person, create fake accounts, manipulate engagement, or use Aasai Talk to solicit money."},
      {"title":"Use good judgment","description":"Keep profiles and messages appropriate for an adult social community. Avoid spam, repeated unwanted messages, and content that makes others feel unsafe."}
    ]$json$::jsonb,
    now()
  )
on conflict (key) do update
set title = excluded.title,
    category = excluded.category,
    content = excluded.content,
    updated_at = excluded.updated_at;
