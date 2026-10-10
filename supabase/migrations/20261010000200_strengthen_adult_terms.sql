begin;

-- Keep the public Terms page clear about the age gate, safety rules, and
-- payment/host expectations. This page is available before registration.
insert into public.app_policies_and_settings (key, title, category, content, updated_at)
values (
  'terms',
  'Terms and Conditions',
  'policy',
  $json$[
    {"title":"Adults only — 18+","description":"Aasai Talk is for adults aged 18 and over only. Do not create or use an account if you are under 18. By registering, you confirm that you are at least 18 years old. We may suspend or close an account when age information is false or cannot be verified."},
    {"title":"Your account","description":"Use accurate account information, keep your sign-in code private, and do not share, sell, or let another person use your account."},
    {"title":"Respectful and lawful use","description":"Use Aasai Talk only for respectful, lawful communication. Do not impersonate anyone, scam people, spam, harass, threaten, or pressure another person."},
    {"title":"Safety and content rules","description":"Nudity, sexually explicit content, exploitation, harassment, threats, fraud, and illegal activity are not allowed. We may review photos, profiles, messages, and video calls to help keep the community safe."},
    {"title":"Coins, calls, and payments","description":"Prices and paid features are shown before you confirm a purchase. Coins are added only after payment is confirmed. Never use a payment method without the account holder's permission or raise a false payment dispute."},
    {"title":"Host earnings and withdrawals","description":"Hosts must use a verified payout destination. Withdrawal requests are checked before payment is sent. Do not submit another person's bank account or UPI ID as your payout destination."},
    {"title":"Enforcement and support","description":"We may limit, suspend, or remove accounts that break these terms or create a safety risk. You can report a safety concern or contact support from the app."}
  ]$json$::jsonb,
  now()
)
on conflict (key) do update
set title = excluded.title,
    category = excluded.category,
    content = excluded.content,
    updated_at = excluded.updated_at;

commit;
