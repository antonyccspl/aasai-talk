# Talkative — Product & Development Plan

**Version:** 1.0  
**Product:** FRND-style social discovery, real-time chat, and one-to-one calling platform  
**Mobile stack:** Expo / React Native + TypeScript  
**Backend:** Supabase (Auth, PostgreSQL, Realtime, Storage, Edge Functions)  
**RTC:** Managed WebRTC provider (select Agora, ZEGOCLOUD, Twilio, or Stream during discovery)  

## 1. Product outcome

Talkative lets people discover available users, communicate through one-to-one real-time chat, and place direct audio or video calls. Optional paid calls use a prepaid wallet; administrators operate the platform through a separate web dashboard.

### User roles

| Role | Primary outcomes |
| --- | --- |
| Normal user | Join, build a profile, discover people, chat, call, manage privacy, and—when enabled—recharge a wallet. |
| Administrator | Moderate users, manage reports, payments, prices, configuration, and auditing. |

### Delivery scope

**MVP:** OTP login, profiles, discovery, durable availability, chat, incoming/outgoing one-to-one audio and video calls, call history, notifications, blocking, and reporting.

**Release 2:** Wallet, Razorpay recharge, paid calls, pricing, and operational admin tools.

**Later:** Ratings, gifts, followers, stories, voice notes, groups, subscriptions, referrals, and promotions.

## 2. Architecture decisions

```text
Expo / React Native app                     Admin web app
        |                                         |
        +----------- Supabase Auth ----------------+
        |                                         |
        +----------- PostgreSQL + RLS -------------+
        +----------- Realtime (presence/events) ---+
        +----------- Storage (approved media) ------+
        +----------- Edge Functions ----------------+
                                      |       |       |
                                  Payments  Push    RTC tokens
                                      |       |       |
                                  Razorpay       FCM/APNs  RTC provider
```

### Non-negotiable boundaries

1. React Native owns presentation, navigation, local interaction, and API invocation—not privileged business decisions.
2. PostgreSQL stores durable application and financial data.
3. Supabase Realtime handles temporary presence, typing, and state/message events; it does not carry audio or video.
4. The RTC service carries media. Its signing secret never reaches the mobile app.
5. Edge Functions or database functions perform all privileged actions: call reservation, call state transitions, RTC token generation, billing, wallet mutation, and Razorpay payment verification.
6. A payment webhook—not a mobile success screen—confirms a recharge.
7. Every sensitive table has Row Level Security (RLS). Service-role credentials remain server-side.

## 3. Project split

The current Expo app becomes the mobile workspace. Backend and admin code should be independent deployable units, sharing only types/contracts where useful.

```text
Talkative/
├── app/ or src/app/                 # Expo Router routes and layouts
├── src/
│   ├── components/                  # Reusable UI components
│   ├── features/                    # Domain modules (preferred ownership boundary)
│   │   ├── auth/
│   │   ├── profile/
│   │   ├── discovery/
│   │   ├── presence/
│   │   ├── chat/
│   │   ├── calls/
│   │   ├── notifications/
│   │   ├── safety/                  # block, report, privacy
│   │   └── wallet/                  # Release 2
│   ├── services/                    # Supabase, RTC, push, payment client adapters
│   ├── hooks/
│   ├── store/
│   ├── types/
│   ├── config/
│   ├── permissions/
│   ├── constants/
│   └── utils/
├── supabase/
│   ├── migrations/                  # Versioned schema, RLS, indexes, DB functions
│   ├── functions/                   # One directory per Edge Function
│   ├── seed.sql                     # Non-production development data only
│   └── tests/                       # SQL/RLS/function tests
├── admin/                           # Separate React/Next.js admin application
│   └── src/features/                # Users, reports, finance, settings, audit
├── docs/
│   ├── architecture.md
│   ├── api-contracts.md
│   ├── call-state-machine.md
│   ├── security-and-rls.md
│   └── runbooks/
└── .env.example                     # Public/client-safe environment variable names only
```

### Feature ownership

| Domain | Mobile responsibilities | Backend responsibilities | Admin responsibilities |
| --- | --- | --- | --- |
| Auth | Login, OTP entry, session UX | Auth configuration, profile bootstrap | Admin sign-in and role enforcement |
| Profiles | View/edit profile, upload UI | RLS, image validation/storage policy | Verification and moderation |
| Discovery | List/search/filter/cards | Indexed query/RPC and public-profile policy | Featured/profile controls |
| Presence | Subscribe/display status | Durable state, call reservation/release | Online operational view |
| Chat | Conversation UI, send/retry, typing | Membership/RLS, notifications, media validation | Moderation only where authorized |
| Calls | Incoming/outgoing UI, RTC client controls | Atomic reservation, state machine, RTC tokens, finalization | Metadata and support review |
| Safety | Block/report/privacy UI | Enforce block rules and report lifecycle | Resolve reports and enforce suspensions |
| Finance | Balance and Razorpay recharge UX | Webhook verification, ledger, billing | Rates, reconciliation |

## 4. Mobile information architecture

### Route groups

```text
Root
├── (auth)
│   ├── splash
│   ├── login
│   ├── otp
│   ├── create-profile
│   └── permissions
├── (tabs)
│   ├── home / discover
│   ├── chats
│   ├── notifications
│   └── profile
├── chat/[conversationId]
├── user/[userId]
├── calls/
│   ├── incoming/[callId]            # overlay/modal
│   ├── audio/[callId]
│   ├── video/[callId]
│   └── history
├── settings/
│   ├── privacy
│   ├── blocked-users
│   ├── help
│   └── delete-account
└── wallet/                          # Release 2
```

### MVP screens

| Area | Screens |
| --- | --- |
| Authentication | Splash, login, OTP, profile setup, permission education |
| Discovery | Home, discover/search, filter sheet, user profile, favorites |
| Chat | Conversation list, one-to-one chat, media picker, retry/error states |
| Calls | Incoming call, audio call, video call, call history |
| Account | Profile, edit profile, notifications, settings, privacy, blocks, report, delete account |

### Required permission behavior

Request microphone and camera only at the relevant call action; request notifications at a user-understandable moment; request photo/media access only for uploads. Every permission path must handle granted, denied, permanently denied, and changed-in-settings outcomes.

## 5. Core data model

Supabase Auth is the identity source. Do not manually store passwords in PostgreSQL. `profiles.id` references `auth.users.id`.

### Identity, profile, and presence

| Table | Purpose | Key fields |
| --- | --- | --- |
| `profiles` | Public and self-managed user data | `id`, `name`, `username`, `photo_path`, `dob`, `gender`, `bio`, `languages`, `interests`, `location`, `role`, `verification_status`, timestamps |
| `user_presence` | Durable availability snapshot | `user_id`, `presence`, `availability`, `last_seen`, `current_call_id` |
| `device_tokens` | Push delivery endpoints | `id`, `user_id`, `token`, `platform`, `active`, `updated_at` |
| `favorites` | User favorites | `user_id`, `favorite_user_id`, `created_at` |
| `blocked_users` | Blocking relation | `blocker_id`, `blocked_user_id`, `created_at` |
| `reports` | Safety reporting workflow | reporter/reported IDs, reason, description, status, resolver/timestamps |

### Chat

| Table | Purpose | Key fields |
| --- | --- | --- |
| `conversations` | One-to-one conversation record | `id`, `last_message_at`, timestamps |
| `conversation_members` | Membership and unread/read state | `conversation_id`, `user_id`, `last_read_message_id`, `joined_at` |
| `messages` | Immutable/chat message stream | `id`, `conversation_id`, `sender_id`, `type`, body/media reference, `created_at`, delivery state |

Message types: `TEXT`, `IMAGE`, `VIDEO`, `AUDIO`, `FILE`, `SYSTEM`, `CALL`. Typing indicators use ephemeral Realtime broadcasts, not a database write for every keystroke.

### Calling

| Table | Purpose | Key fields |
| --- | --- | --- |
| `calls` | Source of truth for a call lifecycle | caller/receiver IDs, type, status, timestamps, duration, rate, amount, RTC channel |
| `call_participants` | Participant/device metadata where needed | `call_id`, `user_id`, join/leave timestamps, role |

Call statuses: `INITIATED`, `RINGING`, `ACCEPTED`, `CONNECTING`, `CONNECTED`, `ENDED`, `REJECTED`, `MISSED`, `CANCELLED`, `FAILED`, `BUSY`.

### Monetization and administration (Release 2)

| Table | Purpose |
| --- | --- |
| `wallets`, `wallet_transactions` | Current balance plus immutable financial ledger |
| `payments`, `payment_webhooks` | Gateway order and idempotent webhook processing |
| `call_rates` | Effective, admin-controlled price/minimum balance configuration |
| `ratings` | One rating per eligible completed call |
| `notifications` | In-app notification history |
| `app_settings` | Controlled, auditable app configuration |
| `admin_users`, `audit_logs` | Admin authorization and sensitive-action history |

### Relationship summary

```text
Auth user ──1:1── Profile
    │                 │
    ├──1:1── Presence ├── favorites / blocks / reports / ratings
    ├──1:1── Wallet   └── device tokens
    ├──< conversations through conversation_members >── messages
    └── calls (caller or receiver) ── RTC session / billing / rating

Payment ── webhook ── wallet transaction
```

### Data rules and indexes

- Use UUID primary keys, foreign keys, timestamps, and checks/enums for status fields.
- Enforce uniqueness for one-to-one conversation membership, a rating per call/user, a webhook event, and ledger idempotency keys.
- Index `profiles(role, created_at)`, `user_presence(presence, availability)`, `messages(conversation_id, created_at)`, call participant/status/date fields, transaction user/date fields, and `reports(status)`.
- Store only storage paths in tables; use expiring signed URLs or protected policies for sensitive media.

## 6. Real-time and call design

### Presence model

| Visible state | Durable values |
| --- | --- |
| Online and available | `presence=online`, `availability=available`, `current_call_id=null` |
| Busy | `presence=online`, `availability=busy`, `current_call_id=<call id>` |
| Offline | `presence=offline`, `availability=unavailable`, `last_seen=<timestamp>` |

Use Realtime Presence for live connections and `user_presence` for recovery, last-seen, availability, and call-critical state. The backend, not client local state, transitions to and from busy.

### Call state machine

```text
INITIATED → RINGING → ACCEPTED → CONNECTING → CONNECTED → ENDED
     │          │          │             │
     │          ├→ REJECTED │             └→ FAILED
     │          ├→ MISSED   └→ FAILED
     ├→ BUSY
     └→ CANCELLED
```

### Audio/video call flow

1. Caller requests `create-call` with recipient and call type.
2. Backend checks account, block state, receiver availability, and (when enabled) balance.
3. A transaction/RPC atomically changes the receiver from available to reserved/busy and creates the call. Concurrent attempts must fail cleanly.
4. Backend sends an incoming-call push and publishes the state event.
5. The receiver accepts, rejects, or times out. Acceptance produces short-lived, call-scoped RTC tokens.
6. Each authenticated participant joins the RTC channel. The call becomes connected only after server-confirmed connection events.
7. On termination, a single idempotent finalizer stores duration, applies billing if enabled, saves history, notifies participants, and restores availability.

### RTC and incoming-call requirements

- Generate temporary RTC credentials only after validating both the caller and receiver against the call record.
- Never embed a permanent provider secret in the app.
- Audio controls: mute, speaker, end, timer, connection state.
- Video controls: local preview, remote stream, mic/camera toggle, front/back switch, speaker, timer, recovery UX.
- Test foreground, background, killed app, locked screen, network switches, interruptions, Bluetooth, denied permissions, offline/busy/rejection, expired token, and RTC failures.
- Production incoming calls require FCM/APNs and native Android/iOS calling integrations appropriate to the chosen provider and platform policy.

## 7. Backend API / Edge Function plan

Each privileged endpoint authenticates the requester, validates authorization server-side, emits auditable errors, and uses an idempotency key where a retry could mutate value.

| Area | Functions |
| --- | --- |
| Identity | `initialize-profile`, `delete-account` |
| Presence | `update-availability`, `reserve-user-for-call`, `release-user-after-call` |
| Calls | `create-call`, `accept-call`, `reject-call`, `cancel-call`, `get-rtc-token`, `finalize-call` |
| Chat | media authorization/validation and notification dispatch as needed |
| Razorpay payments | `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, `refund-razorpay-payment` |
| Wallet | `get-balance`, `debit-wallet`, `refund-wallet`, `confirm-recharge` |
| Notifications | `send-push`, `send-incoming-call-notification`, `send-chat-notification` |
| Admin | `suspend-user`, `update-pricing`, `update-app-settings` |

## 8. Security, privacy, and reliability baseline

### Authorization and data protection

- Enable RLS on every user-sensitive table and test every policy as an anonymous user, member, non-member, and administrator.
- Users may edit only their own profile, view only their wallet/transactions, read only their conversations/messages, and create messages only as themselves.
- Users must not mutate another wallet, billing record, payment verification, or administrative data.
- Enforce block checks for discovery details, chat initiation, message delivery, and call creation.
- Validate file type, size, ownership, and storage path; do not expose unrestricted media buckets.
- Keep service-role, payment, webhook, and RTC secrets in server environment variables only.
- Audit all admin and financial actions.

### Financial correctness

- Payment credit occurs only after verified webhook/server confirmation.
- Ledger transactions, webhook events, and call finalization must be idempotent and protected by database constraints.
- Calculate connected duration and billing on the server; never trust device clocks, amounts, or call duration from the client.
- Define billing unit, rounding, grace period, authorization/reservation, insufficient-balance rule, refunds, and dispute process before Release 2.

### Abuse and operational protection

- Apply OTP, login, message, and call rate limits.
- Add duplicate webhook/transaction prevention, suspicious activity logs, and report-abuse controls.
- Define retention/deletion rules for messages, media, call metadata, payments, audit logs, reports, and notifications.
- Obtain legal/tax/payment advice for India before processing paid calls through Razorpay. Publish privacy, terms, refund, community, and account-deletion policies before launch.

## 9. Implementation phases

### Phase 0 — Product and technical discovery

**Goal:** remove architecture ambiguity before building sensitive flows.

- Select the RTC provider against pricing, Android/iOS support, incoming-call capability, SDK maturity, and token model.
- Select OTP provider/Auth configuration and decide which optional sign-ins are in scope.
- Define public profile fields, moderation rules, age eligibility, media rules, and whether Razorpay monetization is in MVP.
- Write database ERD, RLS matrix, call-state contract, API error contract, design system, and acceptance criteria.
- Provision development, staging/UAT, and production environments with separate credentials.

**Exit criterion:** approved architecture and backlog; secrets/configuration plan is ready; no production secret is in the app.

### Phase 1 — Foundation, identity, and profile

- Stabilize Expo Router structure, TypeScript conventions, theme, error/loading UI, configuration, and release channels.
- Configure Supabase Auth, session persistence, OTP flow, profile initialization, logout, and secure account deletion.
- Build profile creation/editing/photo upload, Storage policy, migration framework, baseline RLS, and test fixtures.
- Add root navigation and guarded auth/main routes.

**Deliverable:** a user can register, sign in/out, and create/manage their profile securely.

### Phase 2 — Discovery, social graph, and availability

- Build discover feed, pagination, search, server-side filters, user cards, profile detail, and favorites.
- Add presence subscriptions with durable `last_seen` fallback.
- Implement availability controls, block/report flows, and backend enforcement.

**Deliverable:** users can find eligible people, view reliable availability, favorite them, and safely block/report them.

### Phase 3 — One-to-one real-time chat

- Add conversation creation with uniqueness protection, list, messages, pagination, send/retry, unread/read state, and last-message summary.
- Add Realtime subscriptions, broadcast typing indicators, network recovery, media upload validation, and chat pushes.
- Test membership RLS and blocked-user behavior thoroughly.

**Deliverable:** reliable private one-to-one chat with readable failure/retry behavior.

### Phase 4 — Audio calls

- Integrate the selected RTC SDK behind an `rtc` service adapter.
- Build call reservation/state transitions, push-triggered incoming call UX, accept/reject/cancel/timeout, token retrieval, audio controls, end/finalization, and history.
- Test concurrency: two callers targeting one receiver must yield exactly one successful reservation.

**Deliverable:** stable, secure one-to-one audio calling with accurate history and busy-state recovery.

### Phase 5 — Video calls and background behavior

- Add local/remote video UI, microphone/camera controls, camera switch, network recovery, and permission paths.
- Implement platform-appropriate Android/iOS background and incoming-call handling.
- Run real-device matrix tests on different network conditions and interruptions.

**Deliverable:** stable one-to-one video calling on supported devices and states.

### Phase 6 — Wallet, Razorpay, and paid-call monetization

- Build an immutable wallet ledger, recharge packages, Razorpay order flow, verified Razorpay webhooks, reconciliation, and user transaction history.
- Add admin-managed rates, minimum balance, authorization/reservation, server billing, and refunds.
- Add financial idempotency, reconciliation runbooks, and finance-specific admin auditing.

**Deliverable:** secure prepaid paid calls, with no client-controlled financial mutation.

### Phase 7 — Admin web dashboard

- Create admin authentication/roles, dashboard metrics, user management, moderation, reports, call metadata, Razorpay payments, wallets, rates, settings, analytics, and audit log views.
- Ensure every sensitive action is permissioned and auditable.

**Deliverable:** an operations team can run the platform without direct database access.

### Phase 8 — Production hardening and release

- Complete security/RLS review, load/performance testing, crash/error monitoring, database backups, payment reconciliation, and incident runbooks.
- Validate push, RTC, background/killed-state calls, payment error paths, real-device compatibility, app signing, and store assets.
- Complete legal documents, support process, release checklist, staged rollout, and rollback plan.

**Deliverable:** approved Android/iOS production release.

## 10. Quality strategy

### Automated testing

- Unit test domain utilities, state reducers, validation, price/rounding helpers, and service adapters.
- Integration test Supabase migrations, database functions, RLS policies, Edge Functions, payment signatures, and idempotency behavior.
- Add end-to-end test paths for login, profile, discovery, chat, call initiation/acceptance, blocking, reporting, and—in Release 2—recharge/billing.

### Manual real-device matrix

| Area | Essential cases |
| --- | --- |
| Auth/profile | valid/invalid/expired OTP, session expiry, logout, deletion, image failures |
| Presence | online/offline/busy, reconnect, app background/killed, network switch |
| Chat | send/receive/read/typing, media failure, retry, offline recovery, blocks |
| Calls | accept/reject/missed/busy/end, speaker/mute/camera, token expiry, poor network, competing callers |
| Razorpay payments | success/failure/cancel/pending, delayed/duplicate webhook, refund, duplicate transaction |
| Admin | suspension, report resolution, rate change, audit trail |

### Performance targets

- Use paginated server queries and server-side filtering for discovery and history.
- Use efficient virtualized lists, lazy loading, image compression/caching, and no unnecessary Realtime subscriptions.
- Measure startup, discover scrolling, chat pagination, notification delivery, call setup latency, and function/database error rates.
- Review indexes and query plans after the actual query design is implemented; avoid N+1 fetches.

## 11. Environment and configuration

| Environment | Purpose | Rules |
| --- | --- | --- |
| Development | Local feature work | Isolated Supabase/RTC/Razorpay test credentials and seed data |
| Staging / UAT | Integrated acceptance testing | Production-like policies, Razorpay test mode/RTC setup, controlled testers |
| Production | Live customers | Only release credentials; deploy through reviewed CI/CD |

Client-safe values may include Supabase URL, Supabase publishable/anon key, RTC app ID, and Razorpay Key ID. Server-only values include Supabase service role, RTC secret, Razorpay Key Secret, and Razorpay webhook signing secret.

## 12. Production release checklist

- [ ] Production Supabase project, database migrations, backups, and tested RLS/storage policies
- [ ] Edge Functions deployed with production-only secrets and monitoring
- [ ] RTC production credentials, short-lived token behavior, and device call tests complete
- [ ] Razorpay orders/webhooks, idempotency, refund path, and financial reconciliation verified
- [ ] FCM and APNs configured; foreground/background/killed notification behavior tested
- [ ] Crash reporting, error tracking, dashboards, alerts, and incident/runbook ownership active
- [ ] Android signing and release build complete; iOS signing/build complete if iOS is in launch scope
- [ ] Privacy policy, terms, community guidelines, refund policy, support process, and account deletion process published
- [ ] Security review, performance testing, real-device regression testing, and staged rollout plan approved

## 13. Priority order

1. Auth, profile, schema, migrations, RLS, and environment separation.
2. Discovery and durable presence.
3. Chat.
4. Audio calling.
5. Video calling.
6. Push notifications and background calling hardening.
7. Wallet and Razorpay payments.
8. Admin dashboard.
9. Analytics, security, performance, and release operations.

## 14. Key risks to resolve early

| Risk | Decision/mitigation |
| --- | --- |
| RTC provider mismatch | Prototype incoming audio/video calls on real Android and iOS devices before feature commitment. |
| Call race conditions | Use a transaction/atomic database function for reservation; test concurrent requests. |
| Background or killed-app calls | Validate native platform approach and push behavior before promising the feature. |
| Incorrect wallet balances | Use append-only ledger, webhook verification, database constraints, idempotency, and reconciliation. |
| Privacy/data exposure | RLS test suite, protected Storage, minimal data collection, retention/deletion policy. |
| Abuse/moderation workload | Ship block/report tooling in MVP, rate limits, and admin queues before growth features. |
| Scope expansion | Keep monetization, ratings, gifts, groups, and social growth features outside the initial release unless explicitly reprioritized. |

## 15. Definition of done

A feature is complete only when its UI is implemented, database migration and RLS are reviewed, backend validation is in place, error/empty/loading states work, telemetry is defined, tests pass, and the relevant real-device scenarios have been checked. Any financial, call-state, notification, or administrative change must also be idempotent where retries are possible and auditable where it changes sensitive state.
