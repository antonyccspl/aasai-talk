# Aasai Talk and admin portal analysis

Inspected 12 October 2026. Repositories: `D:/Antony/Project/aasai-talk` and `D:/Antony/Project/admin-aasai-talk`. Supabase project reference: `vnpxbqcemqcsyxbunqvf`.

## Scope and evidence

This report maps the checked-out mobile and admin source, local migrations, live PostgREST schema, table counts, public pricing, and selected anonymous access checks. No remote records were changed. Personal messages, identity documents, bank details, credentials, and user profiles were not exported. The raw API schema and inventory contain metadata, not table records.

The database exposes 50 tables and 46 RPCs to the server key. This is an API inventory, not a complete PostgreSQL catalog dump: private schemas, deployed function bodies, triggers, indexes, RLS policy definitions, storage policies, scheduled jobs, Auth provider configuration, and deployed Edge Function source cannot be established from this API alone. Local SQL explains historical behavior; it is not proof of current implementation. In particular, the live schema includes features absent from both local apps and migrations.

Read the required [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/) before analysis. Installed declarations target Expo 57, React Native 0.86.3 and React 19.2.3. No application code was written.

## Architecture and source map

| Layer | Mobile repository | Admin repository |
| --- | --- | --- |
| Framework | Expo Router, React Native, web export | React and Vite |
| Entry | `src/app/_layout.tsx`, `index.tsx`, `explore.tsx`, `[...route].tsx` | `src/main.tsx`, `src/App.tsx` |
| Identity | `src/data/auth.tsx` | Supabase Auth session in `App.tsx` |
| Data client | `src/data/supabase.ts`, REST wrappers | `src/lib/supabase.ts` |
| Shared state | `SampleWorkspaceProvider` → `DemoProvider` | Component state and saved filter preferences |
| Features | `src/ui/account.tsx`, `social.tsx`, `calls.tsx`, `wallet.tsx`, `host.tsx` | Ten portal sections in `App.tsx` |
| Media | `zego-media.tsx`, `data/zego.ts`, `supabase/functions/zego-token/index.ts` | No media engine |
| Native support | Android call sound Kotlin module and config plugin | Browser UI |
| Database history | `supabase/migrations/` | No migrations or `admin-portal` function implementation present |

Both clients use public Supabase credentials. Privileged admin actions go through `/functions/v1/admin-portal` with the signed-in administrator access token. The mobile RTC token function uses server credentials internally. Neither client configuration is designed to contain the Supabase secret key.

## Mobile flows

### Startup, identity and onboarding

1. Auth restores a Supabase session and separate demo flags/phone from SecureStore on native or localStorage on web.
2. Workspace initialization waits for auth restoration, then opens a token-addressed database workspace and loads directory, catalog/platform data.
3. Root routes to splash or Explore. The catch-all route protects most screens with the client authenticated/demo-phone state, with public auth and policy routes.
4. The visible phone login uses the demo path. OTP `123456` is checked in the client, then `open_phone_identity(input_phone)` is called. The Auth provider also defines real SMS OTP methods, but the visible verification action calls `verifyDemoOtp`.
5. New accounts go to profile setup; existing profile-complete identities go to Explore. Profile editing covers display name, username, biography, location, languages/interests, gender, DOB and photo. Local SQL includes adult-profile enforcement.
6. Phone profiles use `complete_phone_identity` and `get_phone_identity_profile`; actual Supabase Auth users use owner-restricted `profiles` reads/upserts. These are two distinct identity models.
7. Phone photos upload into `host-photos` with a phone-derived filename. Current deployed storage write rules were not inspected.

Demo login establishes client state, not verified ownership of a phone number. Route guards are a UX mechanism and cannot replace server authorization. Some calling and chat screens specifically require `demoPhone`, so restoring only a real Supabase session does not make those features usable automatically.

### Workspace persistence

`src/data/sample-workspace.tsx` generates a random 32-byte workspace token, stored separately by identity and device/browser. `open_demo_workspace` retrieves JSON state and revision. Changes debounce for 350 ms and `save_demo_workspace` receives the expected revision. Backgrounding also flushes. A save failure rereads the remote snapshot to recognize a previously successful save; conflicting state produces a retry banner.

Workspace state includes profile drafts, preferences, favorites, blocks, call history, transactions, demo balance/earnings, withdrawal records, deletion requests, ratings and legacy admin edits. It coexists with authoritative phone wallet/call/message records. Device-specific workspace tokens mean phone login on another device does not itself select the same workspace. Optional platform fetch failures are often converted to empty arrays, concealing the difference between denied reads and genuinely empty data.

### Discovery and safety preferences

`get_public_directory_profiles` supplies directory cards. The latest local directory migration limits the phone directory to approved female Hosts. IDs encode phone numbers (`phone_...`), which screens decode for calling/chat. Availability, language, gender, interests, age, price and text filters run in the client. Favorites and blocked IDs live in workspace state; authenticated Supabase users additionally persist UUID preferences to `favorites`, `blocked_users` and `user_settings`.

Approved Hosts see a Host workspace prompt rather than the caller discovery list. Phone workspace blocks do not call the newer live `phone_user_blocks` table, so current local UI blocking is not evidence of server-wide blocking enforcement.

### Chat and inbox

`get_phone_conversations` loads inbox previews; `get_phone_messages` loads a pair's history. Chat refreshes every five seconds and also subscribes to message INSERT events; handlers deduplicate by ID. `send_phone_message` returns the message and balance. The local paid-message migration deducts one coin under a wallet lock and records `phone_message_wallet_ledger`. Client parsing specifically expects `coins_charged === 1`.

Drafts clear optimistically and are restored on failure. Blocking is checked in UI. Attachment/media screens exist, but the inspected paid text-send path does not upload a chat attachment. The live message-host-earnings ledger and read/unread RPCs represent newer database capabilities not integrated into these wrappers. Anonymous direct reads of `phone_messages` returned 401; Realtime delivery under deployed permissions was not exercised.

### Audio/video calls

Caller opens an outgoing route → `clear_stale_phone_calls` → `start_phone_call` → ringing session with unique room → Host receives invitation → Host calls `update_phone_call(..., connected)` → both navigate to connected call → obtain room token → native media joins/publishes/plays → caller requests minute billing → end/status update → caller requests final settlement → local result/history.

States are ringing, connected, ended, missed, rejected and cancelled. Local SQL verifies male caller and approved female Host, limits acceptance to Host, ignores terminal-state updates, and computes ended duration from server timestamps. Later retry SQL supersedes a caller's unanswered ringing invitation. Some status reads also expire old ringing calls, so they were not invoked during this read-only audit.

Incoming calls poll every 750 ms. Call status polls every two seconds and also attempts Realtime updates. Layout suppresses repeat incoming navigation by session ID. The native RTC component requests permissions, obtains a room token, creates the Zego engine, starts microphone/camera streams, watches connection state and cleans up streams/room/engine. Lifecycle work is serialized. Web and Expo Go do not provide the native Zego engine; a native development build is required for this implementation.

Minute charging is driven by the caller's mounted screen. Errors are logged and insufficient balance attempts to end the call. Final settlement is also caller-driven and failures are logged while the UI still navigates to results. This leaves recovery concerns for crashes, network failures and background execution unless newer deployed backend logic covers them.

Local token-function source checks session participation by the submitted phone and requires connected status, but does not verify the submitted phone against a user JWT. Client token requests send the publishable key as the bearer value. This is a local source security concern; the deployed implementation was not downloaded or tested with a real call.

### Billing and wallet

Live active receiver slabs:

| Host daily minutes | Audio diamonds/min | Audio coins/min | Video diamonds/min | Video coins/min |
| --- | ---: | ---: | ---: | ---: |
| 0–under 15 | 2 | 20 | 4 | 40 |
| 15–under 45 | 3 | 30 | 6 | 60 |
| 45+ | 4 | 40 | 8 | 80 |

Live slabs use 10 coins/diamond and 0.5 coins/rupee. Local settlement rounds positive call duration up to whole minutes and subtracts prior minute-ledger charges; host earnings are calculated as charge × 100 paise in those local definitions. The last local minute-billing replacement does not retain the wallet row lock from the preceding migration. Its duplicate check occurs before insertion, so concurrency deserves verification against deployed SQL.

These local formulas cannot safely be assumed to describe current economics: live standard packs offer three coins per rupee (for example 300 coins for ₹100), while slabs and `rupeesForCoins` imply ₹2 per coin. Local fixed host/application rates and app configuration use video rate 5, while the initial active video slab is 4 diamonds/min. Call UI still has fixed 20/50-coin thresholds/estimates. Receiver earnings, caller spend and recharge conversion need separate authoritative definitions.

Wallet loads a phone balance through `get_phone_wallet_balance`. Catalog prices come from active `coin_packs`. Recharge review → checkout → payment result is explicitly a preview; the sample-credit action changes workspace state, not a verified provider order or phone wallet. Live `phone_payment_orders` and recharge ledger records prove database capability/activity, not integration of this mobile checkout.

Special offers have live bonus, label and date columns, but the mobile loader only selects ID, coins, price and sort order and filters active status. It does not consume offer dates, bonus fields or labels. Some live special `coins` values already appear to include a bonus; the admin display adds `bonus_coins` again. Confirm the intended storage contract before calculating checkout credits.

### Host application and withdrawals

Female users can enter the multistep Host application, select languages/interests and audio/video preferences, then submit `submit_phone_host_application`. Status is read through its RPC. Host dashboard reads daily duration, summary and current slabs.

The document picker stores only a selected filename, not the file bytes or a secure storage path. Admin secure-document buttons require paths, so this application flow cannot supply verified document downloads. The local wrapper forces application rates 2/5.

Withdrawals unlock after approval and validate minimum ₹100 plus UPI or bank format. Submission deducts workspace `hostEarnings` and appends a workspace withdrawal; it does not invoke the live `request_phone_host_withdrawal` RPC. Starting earnings and history contain sample defaults. The admin payout queue consequently cannot be assumed to receive requests from this mobile screen.

### Settings, reports and account lifecycle

Settings cover profile availability, privacy/alert preferences, blocked IDs, theme, policies, help, device permissions, logout and deletion. Global announcements/policies/config are queried from platform tables. Notifications and read flags mostly use workspace/global data; newer live push tables and unread RPCs are not wired in this checkout.

Safety submission posts directly to `safety_reports` with the publishable key. It does not test HTTP success before recording local success. Current anonymous reads of that table return 401, whereas old SQL granted anonymous read/insert/update. The deployed insert rules were deliberately not tested by writing a report.

Deletion stores a workspace request with an explicit notice that automatic deletion is disabled in the sample. The visible introductory text still promises a 15-day clearing period. Logout clears identity flags and signs out real sessions. Help and service-state screens exist; screen presence alone does not establish backend enforcement of maintenance/update/suspension states.

The mobile repository also contains a legacy `/admin` prototype. It has no dedicated administrator role guard and mainly edits workspace state, with some direct platform REST writes. It is distinct from the separate secure admin portal.

## Admin portal flows

Email/password → Supabase Auth session → `admin-portal` access check → server-returned role/pages → permitted navigation. A browser query parameter preserves the section. Global search debounces for 220 ms. Operations share `adminRequest`, which sends the administrator bearer token and surfaces HTTP failures.

| Section | Read actions and workflow |
| --- | --- |
| Overview | `dashboard`; 7/30/90 days, all time or custom dates; revenue, coins, minutes, earnings, users and pending queues |
| Performance | `performance_reports`; Executive/Hosts/Users/Payments/Safety, saved filters and CSV export |
| Hosts | `list_hosts`, `review_host`; approve/reject/inactivate/archive/restore; signed document URL and bank review |
| Payouts | `list_payouts`, `review_payout`; processing/rejection/completion with reviewer note and UTR |
| Payments | `list_payments`; `reconcile_payment` for captured but uncredited orders |
| Users | `list_users`, `set_user_status`; active/inactive/archived restoration |
| Reports | `list_safety`, `review_safety`, `add_moderation_note`; review/resolve/reject with notes |
| Coin packs | `list_coin_packs`, `save_special_offer`, `set_coin_pack_active`; dates, price, coins and bonus |
| Admin access | `list_admin_accounts`, `create_admin_account`, `assign_admin_role`, `reset_staff_password`, `change_own_password` |
| Audit log | `list_audit_logs`; record before/after details and CSV export |

Default pages: super admin all ten; finance Overview/Payouts/Payments/Coin packs; moderator Overview/Hosts/Users/Reports; support Overview/Users. Actual pages come from server response. Staff creation offers a subset of default role pages; the existing-account row updates role but does not edit page access. Lists filter/sort/paginate client-side (12 per page). CSV is generated in-browser.

Server role enforcement, action validation, payment verification/idempotency and audit guarantees cannot be proven from the frontend because `admin-portal` source is absent. No staff account was created and no admin password or remote status was changed to test these actions.

## Database relationships and current activity

Local phone-model relationships center on `phone_identities.phone`: profiles, wallets, applications, messages and phone-based ledgers. Calls identify caller/Host by phone; minute and settlement ledgers associate charges with call session IDs. `host_call_time_ledger` stores per-call duration/date. Message billing associates one ledger entry with a message ID. The older Auth model uses `auth.users` UUIDs for `profiles`, `user_settings`, favorites, blocks, wallets and withdrawals.

Additional live groups cover payment provider orders/recharge, Host bank/compliance/withdrawals/earnings, presence and push, call upgrades, phone blocks/admin status/deletion, support conversations and content moderation. API schema descriptions document column metadata and some foreign keys, but are not a substitute for validating the full constraint catalog.

Observed counts: 38 phone identities, 6 phone profiles, 2 phone wallets, 1 Host application, 4 phone messages, 3 message debit entries, 3 payment orders, 1 recharge entry, 1 payout account, 1 compliance record, 1 Host presence record, 1 support ticket with 3 ticket messages, 1 content-moderation item, 1 admin role, 9 admin audit entries, 11 coin packs and 6 receiver slabs. `call_sessions`, all inspected call-related ledgers, Host withdrawals, safety reports, UUID profiles and UUID wallets currently have zero rows. Counts are a point-in-time snapshot, not usage-history conclusions.

Read-only public checks: coin packs, slabs and app configuration were readable. Phone profiles, phone messages and safety reports were denied (401). Wallet/profile/conversation RPCs accepted an anonymous publishable-key request containing a synthetic phone, returning 0/null/empty list. This demonstrates endpoint availability without an Auth session; it does not prove another user's records are accessible. Older local RPC bodies trust caller-supplied phones, making deployed identity-binding review a priority.

## Confirmed gaps and next work

1. **Identity:** visible fixed demo OTP, phone-based privileged local RPCs and RTC token authorization need a verified server identity contract. Review deployed definitions before asserting current exploitability.
2. **Profile refresh bug:** `refreshUserData` in `src/ui/store.tsx` checks `if (!active) return`, where `active` is the active call state, not an effect lifetime flag. When no call is active, fetched profile/preferences/Host status are not applied. The effect's separate local `active` variable does not govern this callback.
3. **Backend/source drift:** export deployed migrations, policies and Edge Function source into version control. Current API has many capabilities unavailable in local source; rebuilding from these migrations would not reproduce it.
4. **Money flow:** connect verified payment and actual withdrawal requests; define coin/diamond/earnings conversions; remove mixed sample/authoritative balances from financial screens.
5. **Billing reliability:** verify server concurrency, idempotency, crash recovery, automatic settlement, daily timezone and slab transitions. Latest local billing SQL loses a row lock, and client-driven billing cannot guarantee execution.
6. **Documents and moderation:** upload actual documents to private storage, retain secure paths and use signed server-authorized viewing. Validate storage ownership and moderation enforcement on deployed backend.
7. **Truthful failures:** check report/announcement/PATCH HTTP responses before success; distinguish empty data from failed optional requests.
8. **Phone preferences/lifecycle:** connect server blocks, availability/presence, deletion scheduling and unread/push workflows rather than workspace-only flags.
9. **Admin review:** obtain `admin-portal` implementation to verify role/page enforcement and sensitive action auditing; separate or remove the legacy mobile admin prototype from production navigation.

## Validation and limitations

`npm run typecheck` (mobile) and `npm run build` (admin) both stopped because `tsc` was not installed/available. No successful compile or runtime verification is claimed. Dependencies were not installed just for this inspection. Native calls, real SMS OTP, provider checkout/webhook processing, signed document downloads, authenticated admin flows, Realtime delivery and deletion jobs were not exercised.

Files produced: this report, `supabase-api-schema.audit.json`, `supabase-table-inventory.audit.json` and `scripts/inspect-backend-readonly.ps1`. The script performs GET count/metadata requests and accepts its API key as a parameter; no secret is embedded in it. Rotate the secret key shared in chat and use a secure server-side credential channel for future access.

## Complete live table and RPC inventory

The following appendix is generated from the inspected API metadata. Column lists and counts do not contain personal row data.

| Table | Rows | Columns |
| --- | ---: | --- |
| account_deletion_requests | 0 | user_id, reason, details, requested_at, scheduled_for |
| admin_audit_logs | 9 | id, admin_user_id, action, entity_type, entity_id, before_state, after_state, reason, created_at |
| admin_moderation_notes | 0 | id, entity_type, entity_id, note, created_by, created_at |
| admin_roles | 1 | user_id, role, active, created_at, updated_at, page_access |
| announcements | 4 | id, title, message, audience, tag, is_active, created_at |
| app_policies_and_settings | 6 | key, title, category, content, updated_at |
| blocked_users | 0 | user_id, blocked_user_id, created_at |
| call_sessions | 0 | id, caller_phone, host_phone, call_type, status, room_id, started_at, connected_at, ended_at, duration_seconds, created_at, video_upgrade_requested_by, video_upgrade_requested_at, host_notification_read_at |
| calls | 0 | id, person_id, person_name, call_type, status, seconds, incoming, created_at |
| coin_packs | 11 | id, coins, price_paise, active, sort_order, bonus_coins, is_special, special_label, available_from, available_until |
| directory_profiles | 0 | display_name, age, gender, city, languages, interests, bio, availability, avatar_url, accent_color, is_visible, created_at, updated_at, id, firebase_uid |
| favorites | 0 | user_id, favorite_user_id, created_at |
| host_applications | 1 | id, user_id, status, aadhaar_path, pan_path, submitted_at, reviewed_at, review_note, created_at, phone, application_profile, archived_at |
| host_call_time_ledger | 0 | id, host_phone, call_session_id, call_date, duration_seconds, created_at |
| messages | 0 | id, conversation_with, sender_name, is_mine, text, created_at |
| moderator_audit_log | 0 | id, actor_uid, report_id, action, previous_status, new_status, resolution_note, created_at |
| notifications | 0 | id, title, body, path, icon, is_global, created_at |
| phone_account_deletion_requests | 0 | phone, reason, details, status, requested_at, scheduled_for |
| phone_call_minute_ledger | 0 | id, phone, call_session_id, minute_number, diamonds_charged, coin_delta, created_at |
| phone_call_mode_switch_ledger | 0 | id, phone, call_session_id, from_call_type, to_call_type, diamonds_charged, coin_delta, created_at |
| phone_content_moderation_items | 1 | id, owner_phone, content_type, storage_bucket, storage_path, public_url, scan_provider, adult_likelihood, racy_likelihood, provider_result, status, decision_note, reviewed_by, reviewed_at, created_at, updated_at |
| phone_host_compliance | 1 | host_phone, pan_last4, aadhaar_last4, pan_verified, aadhaar_verified, verified_by, verified_at, updated_at |
| phone_host_earnings_ledger | 0 | id, host_phone, call_session_id, source_id, source_kind, call_type, earnings_paise, created_at |
| phone_host_payout_accounts | 1 | host_phone, account_holder_name, account_number, ifsc_code, status, verification_note, created_at, updated_at, verified_at, payout_method, upi_id |
| phone_host_presence | 1 | host_phone, last_seen_at |
| phone_host_withdrawals | 0 | id, host_phone, amount_paise, account_snapshot, status, payout_reference, review_note, created_at, updated_at, review_started_at, review_due_at |
| phone_identities | 38 | phone, profile_complete, profile, created_at, updated_at |
| phone_message_host_earnings_ledger | 0 | id, host_phone, message_id, earnings_paise, created_at |
| phone_message_wallet_ledger | 3 | id, phone, message_id, coin_delta, created_at |
| phone_messages | 4 | id, sender_phone, recipient_phone, text, created_at, read_at |
| phone_payment_orders | 3 | id, phone, coin_pack_id, coins, amount_paise, currency, provider_order_id, provider_payment_id, checkout_token_hash, status, provider_payload, created_at, updated_at, captured_at, credited_at, provider |
| phone_profiles | 6 | phone, display_name, username, bio, gender, date_of_birth, city, languages, interests, created_at, updated_at, avatar_url, community_guidelines_accepted_at, adult_age_confirmed_at |
| phone_push_deliveries | 0 | event_key, recipient_phone, sent_at |
| phone_push_tokens | 0 | expo_push_token, phone, platform, calls_enabled, messages_enabled, wallet_enabled, created_at, updated_at |
| phone_support_ticket_messages | 3 | id, ticket_id, sender_type, sender_phone, admin_user_id, message, created_at |
| phone_support_tickets | 1 | id, phone, subject, category, status, created_at, updated_at, resolved_at |
| phone_user_admin_status | 0 | phone, status, reason, updated_by, updated_at, archived_at |
| phone_user_blocks | 0 | blocker_phone, blocked_phone, created_at |
| phone_wallet_ledger | 0 | id, phone, call_session_id, coin_delta, earnings_delta_paise, created_at |
| phone_wallet_recharge_ledger | 1 | id, phone, client_order_id, coin_delta, source, created_at |
| phone_wallets | 2 | phone, coins, earnings_paise, updated_at |
| platform_metrics | 5 | metric_key, metric_label, metric_value, sub_text, chart_data, updated_at |
| profiles | 0 | id, username, display_name, gender, date_of_birth, bio, city, languages, interests, avatar_path, created_at |
| receiver_coin_diamond_slabs | 6 | id, call_type, diamonds_per_minute, coins_per_diamond, coins_per_rupee, is_active, created_at, updated_at, min_minutes, max_minutes |
| safety_reports | 0 | id, reporter_name, reported_user_id, reported_user_name, reason, details, status, resolution_note, created_at, reporter_phone |
| transactions | 0 | id, title, amount, kind, status, date, created_at |
| user_settings | 0 | user_id, theme, allow_messages, allow_calls, notifications_enabled, availability |
| wallet_ledger | 0 | id, user_id, coin_delta, earnings_delta_paise, kind, idempotency_key, created_at |
| wallets | 0 | user_id, coins, earnings_paise |
| withdrawals | 0 | id, user_id, amount_paise, status, payout_reference, created_at |

### RPC signatures

- `accept_phone_call_video_upgrade(input_phone, input_session_id)`
- `charge_phone_call_minute(input_minute_number, input_phone, input_session_id)`
- `clear_stale_phone_calls(input_phone)`
- `complete_phone_identity(input_phone, input_profile)`
- `credit_phone_wallet_payment(input_payment_order_id)`
- `get_host_daily_call_summary(input_phone)`
- `get_host_daily_call_time(input_phone)`
- `get_host_earning_slabs()`
- `get_incoming_phone_call(input_phone)`
- `get_moderator_ops_summary()`
- `get_phone_call_history(input_limit, input_phone)`
- `get_phone_call_notifications(input_phone)`
- `get_phone_call_state(input_phone, input_session_id)`
- `get_phone_call_status(input_phone, input_session_id)`
- `get_phone_call_summary(input_phone, input_session_id)`
- `get_phone_conversations(input_phone)`
- `get_phone_host_application_status(input_phone)`
- `get_phone_host_call_capabilities(input_host_phone)`
- `get_phone_host_dashboard(input_phone)`
- `get_phone_identity_profile(input_phone)`
- `get_phone_message_notifications(input_phone)`
- `get_phone_messages(input_other_phone, input_phone)`
- `get_phone_notification_unread_count(input_phone)`
- `get_phone_unread_message_count(input_phone)`
- `get_phone_wallet_activity(input_limit, input_phone)`
- `get_phone_wallet_balance(input_phone)`
- `get_public_directory_profiles()`
- `get_receiver_coin_diamond_slab(input_call_type, input_daily_seconds, input_host_phone)`
- `host_rate_paise(input_call_type, input_daily_seconds)`
- `mark_phone_call_notification_read(input_phone, input_session_id)`
- `mark_phone_conversation_read(input_other_phone, input_phone)`
- `moderator_resolve_safety_report(input_actor_uid, input_report_id, input_resolution_note, input_status)`
- `open_demo_workspace(workspace_token)`
- `open_phone_identity(input_phone)`
- `recharge_phone_wallet(input_client_order_id, input_coins, input_phone)`
- `request_phone_call_video_upgrade(input_phone, input_session_id)`
- `request_phone_host_withdrawal(input_amount_paise, input_phone)`
- `review_phone_host_withdrawal(input_payout_reference, input_review_note, input_status, input_withdrawal_id)`
- `rls_auto_enable()`
- `save_demo_workspace(expected_revision, next_state, workspace_token)`
- `send_phone_message(input_recipient_phone, input_sender_phone, input_text)`
- `settle_phone_call(input_phone, input_session_id)`
- `start_phone_call(input_call_type, input_caller_phone, input_host_phone)`
- `submit_phone_host_application(input_application, input_phone)`
- `switch_phone_call_to_video(input_phone, input_session_id)`
- `update_phone_call(input_duration_seconds, input_phone, input_session_id, input_status)`
