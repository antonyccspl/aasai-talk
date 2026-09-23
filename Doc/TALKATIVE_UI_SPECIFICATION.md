# Talkative — Reusable UI Specification

Version: 1.0 · 14 September 2026 · Android first, with iOS and separate web admin layouts.

## 1. Purpose and source precedence

This file is the reusable visual and interaction contract for designing every Talkative screen. Give this file to a designer or development agent together with the reference assets. Screen IDs are stable so implementation tasks, screenshots, and QA can refer to the same screen.

Use these sources in order:

1. Latest user decisions: user-to-user communication, no host/creator role or related payouts, Razorpay for payments.
2. `Doc/TALKATIVE_DEVELOPMENT_PLAN.md`: product behavior and release boundaries.
3. `Design/resonance_minimal_voice/DESIGN.md`: visual language and tokens.
4. `Design/frnd_clean_discovery`, `frnd_clean_chat`, `frnd_clean_audio_call`, and `frnd_clean_wallet`: each contains `screen.png` and `code.html` visual references.

The reference HTML is a design prototype, not production business logic. Preserve its visual character while applying the product decisions below. The original requirements TXT is historical; it must not reintroduce removed roles.

### Reference adaptations

| Reference detail | Talkative treatment |
| --- | --- |
| FRND name and logo | Use Talkative branding; a simple paired speech-wave mark may be created within the existing visual language. |
| Featured Hosts, studio/room terminology | People to meet, Available now, and Audio call. All participants are normal users. |
| Instant Random Pairing / anonymous matching | Use a compact people list with direct contact actions. No random matching engine is specified. |
| Wallet and per-minute prices | Show only when paid calls are enabled. Rates and packs come from approved configuration. |
| UPI AutoPay / instant activation | “Continue with Razorpay.” Do not imply an automatic recurring mandate or guaranteed instant settlement. |
| ₹250 → 55 mins / ₹500 → 120 mins | Use a transparent virtual-currency model instead: 10 coins = 1 diamond; audio costs 2 diamonds (20 coins) per minute and video costs 5 diamonds (50 coins) per minute. |
| End-to-end encryption, spatial audio, 48kHz, verified safety | Show only capabilities actually verified by the implementation; default to simple “Connected” and “Audio call.” |
| Gifts, voice-note recording, rate-call action | Document as later feature variants; hide until enabled. |
| Fake success/timer behavior in HTML | UI prototypes must identify demo data; production payment and call states reflect authoritative service events. |

## 2. Visual system

### Canonical colors

The DESIGN.md front matter and supplied screen HTML use one palette; the prose in DESIGN.md contains another darker palette. Adopt the front matter/HTML palette for normal screens to match the supplied screen images. Reserve the deeper canvas for immersive call backgrounds.

| Token | Value | Use |
| --- | --- | --- |
| `background` / `surface` | `#121413` | App canvas |
| `surfaceLowest` | `#0C0F0E` | Call stage recesses and media backdrops |
| `surfaceLow` | `#1A1C1B` | Cards and list containers |
| `surfaceContainer` | `#1E201F` | Inputs, grouped content |
| `surfaceHigh` | `#282A29` | Selected tabs, floating dock, raised controls |
| `surfaceHighest` | `#333534` | Inner tags and pressed surfaces |
| `primary` | `#4EDEA3` | Main CTA, selected control, outgoing chat bubble |
| `primaryContainer` | `#10B981` | Secondary brand treatment and restrained glow |
| `onPrimary` | `#003824` | Text/icons on mint actions |
| `text` | `#E2E3E0` | Main headings and body |
| `textSecondary` | `#BBCABF` | Supporting copy |
| `outline` | `#86948A` | Muted labels and icons |
| `outlineVariant` | `#3C4A42` | Separators, inactive waveform |
| `error` / `errorContainer` | `#FFB4AB` / `#93000A` | Error banners and end-call controls |
| `critical` | `#F43F5E` | Muted mic and destructive accent |
| `warning` | `#F2C879` | Proposed extension for busy, pending, low balance; pair with text/icon |

Never rely on color alone to communicate availability or payment status. Readable disabled labels are preferable to the very dark text suggested in the prose reference.

### Typography

Use locally bundled, properly licensed Plus Jakarta Sans for interface text and JetBrains Mono for amounts, timestamps, small tags, and call duration. Until font assets are bundled, document any system-font fallback explicitly.

| Style | Size / line height | Weight | Application |
| --- | --- | --- | --- |
| Display | 32 / 40 mobile; 44 / 52 desktop | 700 | Wallet balance, welcome headline |
| Page title | 24 / 30 mobile; 30 / 38 desktop | 600–700 | Main screen headings |
| Section title | 20 / 28 | 600 | Section groups and call identity |
| Card title | 16 / 23 | 600 | User names, list sections |
| Body | 14 / 20 | 400 | Descriptions and messages |
| Supporting | 12 / 17 | 400 | Metadata |
| Mono label | 12 / 17 | 500 | Amounts and timers |
| Small mono | 11 / 14 | 500 | Short badges; permit scaling |
| Button | 14 / 20 | 600 | Action labels |

### Geometry, spacing, and motion

- Compact-density spacing: 4, 8, 12, 16, 20, 28, and 40 logical pixels. Standard mobile horizontal margin: 16.
- Cards: default radius 22, padding 16; compact rows: radius 18, padding 14; pills/avatars: full radius. Avoid oversized containers when a dense list or a concise row communicates the same information.
- Touch targets: primary actions remain 48 high. Inline chips may be 40 high and icon visuals may be 44 high when their surrounding layout preserves comfortable reach and spacing.
- Border: 1px subtle translucent white; prefer tonal depth over heavy borders or gradients.
- Emerald glow is limited to selected actions, live speaking, and a small hero ambience.
- Feedback: 150–200ms color/opacity transitions; selected state must remain visible without motion.
- Respect reduced motion. Waveforms respond to real audio when connected; demo waveforms are explicitly illustrative.
- No fake system status bar. Use native safe-area insets and a light status-bar foreground.

## 3. Reusable components

Build these once and compose screens from them. Components receive data and callbacks; they do not directly execute payment, account, or call authorization logic.

| Component | Inputs / variants | Behavior contract |
| --- | --- | --- |
| `ScreenShell` | scroll/list/form/immersive; title; header actions | Safe areas, keyboard handling, background, loading/error boundary |
| `BrandHeader` | balance optional; profile avatar; notification badge | Aasai Talk at left; profile/notifications accessible at right |
| `StackHeader` | title; back; optional actions | Back preserves context and list position |
| `FloatingTabDock` | active tab; unread count; wallet feature flag | Explore, Calls, Messages, Wallet when enabled; equal-width targets |
| `Avatar` | image, fallback initials, size, presence | Fixed aspect ratio, graceful failed image fallback |
| `StatusBadge` | available/busy/offline/connecting/pending/success/error | Text plus icon/dot; accessible spoken state |
| `Button` / `IconButton` | primary/secondary/quiet/destructive; loading/disabled | Disable repeated submission while pending; explicit accessibility label |
| `Card` / `SectionHeader` | title, supporting label, action | Consistent radius, spacing, surface |
| `Field` | label, value, helper, error, keyboard type | Persistent label; inline validation; never placeholder-only |
| `Chip` / `FilterChips` | single/multiple selection | Selected style, clear state, wrapping or horizontal scroll |
| `UserCard` | user, availability, interests, optional rate/rating | Profile, favorite, audio, video, chat actions; compact actions may go into profile |
| `SettingRow` | icon, label, detail, toggle/chevron | Full row target and named toggle |
| `ConversationRow` | avatar, last message, time, unread | Distinguish unread without relying solely on weight/color |
| `MessageBubble` | text/media/call/system; direction; delivery | Pending, sent, delivered, read, failed and retry states |
| `Composer` | draft, attachment, send | Multiline input; keyboard-safe; disable blank send |
| `CallIdentity` / `CallControlDock` | participant, status, mic/audio/camera actions | Visible named controls; end-call action distinct |
| `BalanceCard` / `RechargePack` | amount, currency, selected pack | No invented bonus or guaranteed talk-time claim |
| `TransactionRow` | type, signed amount, status, date | Debit and credit sign plus descriptive label |
| `BottomSheet` / `ConfirmDialog` | title, body, primary/cancel, children | Focus management, back dismissal, accessible heading |
| `EmptyState` / `ErrorState` / `Skeleton` | heading, message, action | Explain next step; preserve previous content when possible |
| `AdminTable` / `DetailPanel` | columns, filters, pagination, permissions | Accessible desktop density, mobile cards where needed |

## 4. Navigation and layout

The mobile home and discovery requirements share **Explore**. Preserve the reference dock: Explore, Calls, Messages, Wallet. Profile and Notifications are accessed from the header. If monetization is disabled, remove Wallet and redistribute the three remaining tabs. Keep access to Favorites through Explore and Profile.

Auth flow: Splash → Login → OTP → Create profile → Permissions → Explore. Existing complete profiles go directly to Explore. Email, Google, and Apple sign-in are optional variants, not visible dead controls.

Stacks above tabs: search, person profile, favorites, conversation, call detail, settings, notifications, wallet details. Hide the global tab dock in chat, auth, payment, and active-call screens. Call controls and chat composer take its place.

Android back: dismiss top sheet first; then pop stack; active calls minimize into a persistent ongoing-call banner rather than silently hanging up. An intentional end action terminates the call. Returning from Razorpay resumes the existing order status screen.

Responsive rules: 320–430 mobile widths use one column; 768+ tablet may show two discovery columns and split conversation layout; web admin uses a 240px navigation rail and content up to 1280px. Preserve safe areas and readable font scaling. All fixed docks reserve equivalent scroll padding.

## 5. Screen inventory — mobile

Each entry specifies content order, actions, and required state variations. A state can be a reusable variation rather than an additional route. “Later” entries are design coverage, not a change to MVP scope.

### M01 — Splash / session restoration

Route: `/`. Center Aasai Talk mark and wordmark on charcoal, with a restrained loading indicator. Resolve the persisted session and profile completeness before routing. States: loading, restore failure with retry, signed out, signed in, maintenance, required update. Avoid an indefinite splash; an error must become actionable.

### M02 — Welcome and phone login

Route: `/auth/login`. Top brand mark; hero “A good conversation starts here”; short friendly description; labeled country code and phone field; “Send code” pill; links to Terms and Privacy. Support numeric keyboard, country selection, invalid number, sending, OTP service failure, rate limit with retry time. Optional social sign-in variants appear only when configured. No profile role selector.

### M03 — OTP verification

Route: `/auth/otp`. Back, “Check your messages,” masked phone number, change-number action, code entry, countdown, resend, Verify. Accept paste and autofill into the full code field. Code length and resend timing follow Auth configuration. States: incomplete, verifying, incorrect, expired, too many attempts, resend pending, success. Preserve phone number on back.

### M04 — Create profile

Route: `/auth/create-profile`. Progress label, avatar picker, name, username, date of birth, gender if used, bio, languages and interests; optional city. Sections may use a two-step form on short screens. CTA: “Continue.” Show required-field rules, username availability, age-eligibility feedback, image upload/retry, unsaved changes, saving and success. Do not display exact date of birth publicly.

### M05 — Permissions education

Route: `/auth/permissions`. “Make room for conversations.” Cards explain notifications, microphone, and camera with their purposes. “Continue” or “Not now” for optional setup. Trigger operating-system prompts at relevant feature use; this screen does not pretend to grant native permissions. Show allowed, denied, and open-settings paths.

### M06 — Explore / home

Route: `/explore`. Use a compact brand header, a “People to meet” section with one shared filter-icon action, people cards, and floating dock—without a discovery hero, a “Connect with someone new” headline, a search CTA, or quick-filter chips. The shared filters screen applies availability, language, age, interests, gender and enabled price criteria to the full people list. Cards show photo, name/age if allowed, language, optional city and interests. Use a subtly pulsing status beacon at the upper-right: green available, orange busy, red offline; retain a semantic label so the state is not color-only. Available cards place Audio, Video and icon-only Message actions in one flexible row; Audio and Video show diamond rates: 2 diamonds/min (20 coins/min) and 5 diamonds/min (50 coins/min). Busy and Offline states use the matching yellow/red text with the pulsing beacon. Keep a semantic accessibility label for every status and action. States: skeleton, loaded, no users, no eligible users, retry, pagination, reconnecting.

### M07 — Search results

Route: `/search`. Focused search field, clear, cancel/back, filter button with count, result count and UserCards. Search by allowed profile fields, preserve submitted query and filter context. States: initial hint, searching, results, empty with “Clear filters,” offline, failure/retry. Do not require location permission for an ordinary search.

### M08 — Discovery filters sheet

Sheet on Explore/Search. Availability, language, age range where applicable, interests, optional gender; later rating and price filters. Clear selected chips and labels. Footer: Reset and “Show results.” Apply commits the draft; cancel keeps prior filters. Minimum/maximum ranges validate inline. Hide unsupported filters rather than showing inactive controls.

### M09 — Other user profile

Route: `/user/[userId]`. Back and more menu, large avatar, name, availability/last seen where allowed, bio, language, interests, optional city, favorite control. Bottom actions: Audio call, Video call, Message; price disclosure before a paid call. More menu: Report and Block. States: loading, unavailable/deleted, blocked, busy, offline, ready. Do not show host verification, earnings, payouts, or role badges. Rating summary is a later variant only.

### M10 — Favorites

Route: `/favorites`. Title, optional availability filter, saved UserCards, remove favorite. Empty copy “Keep your favorite conversations close” with “Explore people.” Removal provides undo where practical; a deleted or blocked profile becomes unavailable.

### M11 — Messages / conversation list

Route: `/messages`. Header, “Messages,” search, conversation rows with avatars, last text/media/call summary, time, unread badge, optional presence. Open row → M12; new conversation → Search. States: no conversations, loaded, unread, searching, load failure, offline cached list. Long names and preview text truncate independently.

### M12 — Chat thread

Route: `/chat/[conversationId]`. Follow the chat image: contextual header with avatar/name and status; 48px audio, video and more targets; date separator; incoming charcoal and outgoing mint bubbles; timestamps and receipt icons; call-summary card; fixed rounded composer above keyboard. Avoid duplicating two large headers on a narrow device. Actions: send text, attachments, open media, retry failed message, profile, audio/video call, block/report. States: loading older history, typing, pending/sent/delivered/read, failed, offline, blocked, unavailable conversation. Only scroll to bottom automatically if already near it; otherwise show a new-message control. Draft survives temporary navigation. Voice notes and Rate call are later variants. Do not claim HD spatial audio without service support.

### M13 — Attachment picker / media preview

Sheet plus `/chat/media-preview`. Show only enabled image/video/file types; native picker, selected preview, filename/size where useful, optional caption, cancel and send. Handle upload progress, file too large, unsupported type, permission denial, upload failure with retry/removal. Camera capture is optional. No voice recording control until that later feature is enabled.

### M14 — Shared media viewer

Route: `/media/[messageId]`. Dark immersive image/video display, back/close, sender and date, playback controls for video. Fit media without distortion. Show loading, expired/unavailable media, access removed, download/play error. Sharing or saving appears only when approved by privacy behavior.

### M15 — Outgoing call / ringing

Route: `/calls/outgoing/[callId]`. Large circular person portrait with soft rings, name, Audio/Video call type, status “Starting call…” then “Ringing…,” cancel control. Paid call displays confirmed rate before connection. No connected-duration timer until connected. States: reservation pending, ringing, cancelled, busy, offline, rejected, timeout, permission denied, insufficient balance, RTC/server failure. Retry creates or resumes a call according to backend state; repeated taps cannot create duplicates.

### M16 — Incoming call

Route: `/calls/incoming/[callId]`. Caller portrait/name, Audio or Video call label, Reject red control and Accept mint control with visible labels; for video, “Accept video call.” Respect native incoming-call presentation when available. On timeout or caller cancellation, dismiss ringing and record the appropriate result. Lock-screen exposure follows privacy settings. Accept validates that the call is still valid.

### M17 — Active audio call

Route: `/calls/audio/[callId]`. Follow the audio-call reference: top back/minimize and contextual title, duration pill, optional rate/balance pill, large circular portrait with restrained speaking halo, name, Connected/Speaking text, waveform, floating call-control dock. Controls: Mute, audio route, open chat, End. Omit gift control. Speaker/earpiece/Bluetooth selector lists actually available routes. States: connecting, connected, muted, remote muted where known, reconnecting, interrupted, ending. Keep end accessible during poor connection. Show low-balance warning only for paid mode. No unsupported encryption/sample-rate badges.

### M18 — Active video call

Route: `/calls/video/[callId]`. Full remote video stage, dark readability scrim, participant name and duration, rounded local preview in safe upper corner, compact connection banner, bottom controls for mic, camera, camera switch, audio route, and End. Controls may wrap into two rows on narrow screens. Preview never covers End. Camera-off state shows avatar and “Camera off”; remote video unavailable has an independent placeholder. States: connecting, local camera denied, remote camera off, muted, reconnecting, app backgrounded, interruption, ending. No generic photo should masquerade as a real live feed.

### M19 — Call ended / result

Route: `/calls/result/[callId]`. Result icon, person, “Call ended” or precise failure, duration only if connected, final amount or “Finalizing charge” in paid mode. Actions: Message, Back to calls, and eligible Retry. Later: optional Rate call. Distinguish rejected, missed, cancelled, busy, failed and successful calls. Do not turn failed calls into completed summaries.

### M20 — Call history

Route: `/calls`. Header, title, All / Audio / Video / Missed filters; incoming/outgoing filter in sheet if needed. Rows show avatar, name, direction/type icon, date/time, duration, status and coins spent (audio: 20 coins/min; video: 50 coins/min). Tap → M21; explicit call-back action confirms any paid rate. States: loading, empty, filtered empty, pagination, stale/offline history, retry.

### M21 — Call details

Route: `/calls/[callId]`. Person and type/status, started/connected/ended timestamps when available, duration, amount/rate only for paid calls, receipt/transaction link, Message, Call again, Report. Show incomplete finalization separately and refresh status safely.

### M22 — Wallet

Route: `/wallet`, Release 2. Use a coin-pack grid rather than an INR available-balance card. Each pack shows coins first and its Razorpay price beneath (for example, 100 coins for ₹200); selected treatment is mint. Show the conversion “10 coins = 1 diamond,” “Buy [coins] with Razorpay,” provider explanation, Recent activity and View all. Sample packs: 100, 250, 500, 750, 1,000 and 1,500 coins, with prices supplied by approved configuration. Transaction history shows credited or spent coins. Loading/error state must never impersonate a zero balance. Pack selection changes the CTA and amount; backend validates the order.

### M23 — Recharge review

Route: `/wallet/recharge`. Selected amount, optional custom amount if enabled, balance before, exact credit/fees/taxes if applicable, and “Continue with Razorpay.” Back changes pack. States: amount validation, creating order, order failure/retry. No unsupported “No hidden charges” promise; show the actual breakdown. Amount example is explicitly configured data, not a hardcoded contract.

### M24 — Razorpay checkout handoff

Provider-owned checkout with a Talkative transition screen. Explain “Complete your payment with Razorpay”; selected amount and cancel/back. Keep sensitive payment entry inside the supported provider flow. Only display payment methods offered by that checkout. App UI states: opening, returning, cancelled, failed to open. Do not reproduce a fake Razorpay payment form.

### M25 — Payment result / verification

Route: `/wallet/payment/[paymentId]`. Distinct pending, success, failed, cancelled and refunded variants. Pending: “We’re confirming your payment,” order reference, Check status, Back to wallet. Success requires verified backend credit; show confirmed amount/reference and View transaction. Failure: Retry safely or Help. Delayed webhook remains pending. Repeated callbacks do not duplicate credit. Cancelled UI must still reconcile a payment that completed externally.

### M26 — Transaction history

Route: `/wallet/transactions`. Search/reference filter where useful, All / Recharges / Calls / Refunds, date range, signed amounts, status and timestamp. Include bonus/admin-adjustment labels if the ledger supports them. Empty, filtered empty, loading, error and pagination. Row → M27.

### M27 — Transaction detail

Route: `/wallet/transactions/[transactionId]`. Type/status, amount and currency, reference, date, payment or call linkage, refund information if relevant, Support. Display only safe gateway identifiers. Never expose signing secrets or full payment credentials.

### M28 — My profile

Route: `/profile`. Avatar, name, username, bio, language/interest chips, Edit profile, availability row, Favorites, Call history, Wallet when enabled, Notifications, Settings. No earnings dashboard. Availability clearly distinguishes desired availability from being busy in a call.

### M29 — Edit profile

Route: `/profile/edit`. Reuse M04 fields; image change/remove sheet, editable personal data, Save. Show validation, pending upload, unsaved-change confirmation, save failure/retry, saved state. Age is derived from date of birth; avoid conflicting editable age.

### M30 — Availability

Sheet or `/profile/availability`. Available / Unavailable controls with explanation. Busy is shown as call-controlled, not freely selectable while a call is active. Save pending/failure, offline status, active-call restriction and reconnect refresh. Do not promise that a local toggle alone changes server availability.

### M31 — Notifications

Route: `/notifications`. All / Unread, grouped dates, rows for messages, incoming/missed/end calls, recharge/payment/refund and admin announcements. Mark read and navigate to authorized destination. States: empty, unread, loading, error, removed destination; notification permission disabled banner with settings link. No removed-role notification types.

### M32 — Settings

Route: `/settings`. Show Theme first, then four policy links: Privacy policy, Terms and conditions, Safety center and Community guidelines. Theme immediately changes the shared dark/light palette. Delete account remains a distinct destructive action below the policy list. Do not expose decorative toggles with no actual behavior.

### M33 — Privacy and safety settings

Route: `/settings/privacy`. Controls for visibility/last-seen and incoming communication only if supported by backend policy; each setting explains its effect. Blocked users, Community guidelines, Report support. Saving/error feedback. Unimplemented optional settings stay hidden rather than suggesting protection that does not exist.

### M34 — Notification preferences

Route: `/settings/notifications`. Message alerts, call alerts, wallet/payment updates and announcements as supported; show system permission state and Open settings. Distinguish app preferences from operating-system delivery permission. Saving/failure states; any essential service notifications are labeled according to final product rules.

### M35 — Blocked users

Route: `/settings/blocked-users`. Avatar/name/date and Unblock per row; confirmation sheet, pending and failure states. Empty copy “You haven’t blocked anyone.” Unblock restores future eligibility, not deleted content.

### M36 — Block confirmation

Sheet from profile/chat/history. “Block [name]?” Explain effects on messaging and calls; Cancel and Block. Optional separate “Also report” action is explicit. States: submitting, success, error; close routes or disable composer/actions according to the resulting restriction.

### M37 — Report user

Route/sheet: `/report/[userId]`. Reason choices: Spam, Harassment, Fake profile, Abusive behavior, Scam, Inappropriate content, Other. Optional description, related call/message reference when entered from context, Submit report. Require a reason and conditional Other detail. Success shows acknowledgement/reference if provided, plus optional Block. Failure preserves draft; no promise of immediate resolution.

### M38 — Help and support

Route: `/settings/help`. Searchable or grouped FAQ for account, calls, messages and payments; support contact from app settings; payment/call reference links when contextual. Clear no-network and unavailable-support-info state. Do not fabricate a support phone/email or send messages without user action.

### M39 — Policy viewer

Route: `/settings/policies/[type]`. Privacy, Terms, Community guidelines, Refund/payment terms and data deletion information. Title, version/effective date if supplied, readable scroll content, open external link when appropriate. Loading/error/retry. Placeholder legal copy must be visibly labeled as draft.

### M40 — Logout confirmation

Sheet. “Log out of Talkative?” Explain returning through login; Cancel and Log out. Respect an ongoing call with an explicit end-call choice. Pending/failure state; clear session-bound private cache after successful logout.

### M41 — Delete account

Route: `/settings/delete-account`. Use a confirmation-dialog layout explaining that the profile, conversations and personal data are scheduled to clear after 15 days. Require one reason: Asked for money, Not interested, Unable to hear, Buddy not polite, Abusive language or Others; selecting Others reveals a textarea. Require DELETE confirmation before submission. Cancel and Delete account. Active call/payment cases receive a concrete resolution path. States: request pending, reauthentication required, accepted, failed/retry. Do not claim that retained transaction records vanish immediately.

### M42 — Permissions management / denied permission sheet

Route: `/settings/permissions`. Microphone, Camera, Notifications and Photos/media with actual device status. At use time, denial sheet offers Try again or Open settings when appropriate and Cancel. Microphone denial blocks audio joining; camera denial can offer audio-only participation if supported. Return from system settings refreshes status.

### M43 — Ongoing call banner

Persistent compact overlay outside the call stage. Person, audio/video icon, duration/status and “Return to call.” Never obstruct composer, dock, keyboard, or primary CTA. Visible only while a real or explicitly demo call is ongoing; ending removes it everywhere.

### M44 — Low balance / insufficient balance

Paid-mode sheet. Before connection: required minimum, available balance, Recharge and Cancel. During call: explicit remaining allowance/warning from service, recharge action only if safely supported, End. Returning from recharge rechecks balance. No optimistic extension of call time on a client payment callback.

### M45 — Service states

Reusable full-screen variants: offline/retry, maintenance with server message, mandatory update with configured store destination, session expired with Sign in, suspended account with support, unavailable content with Back. Distinguish offline cached browsing from unavailable call/payment actions.

### M46 — Rate completed call (later)

Bottom sheet matching chat reference. “How was your call?”, 1–5 stars with accessible value labels, optional review and tags, Skip/Submit. Require an eligible completed call and one rating per applicable call/user. Submission reflects selected stars, not a fixed five-star success. Hide until enabled.

## 6. Admin web screens

Admin is a separate web application. Reuse color/type/status tokens but use denser tables, a left rail, search/filter toolbar and right detail panel. Mobile consumers must not see admin navigation. All lists need pagination, loading, empty, error, permission-denied and data-refresh states.

| ID / route | Layout and essential content | Actions / special states |
| --- | --- | --- |
| A01 `/admin/login` | Centered brand panel, configured admin credentials and optional configured MFA flow | Sign in, invalid credentials, locked/expired session, unauthorized role |
| A02 `/admin` | Date range; users/online users/calls/audio minutes/video minutes/recharge revenue cards; trend charts; open reports and failures | Drill into source list; unavailable metrics distinct from zero |
| A03 `/admin/users` | Search by allowed name/ID; status filters; user table with joined date and account state | Open detail; pagination; explicit status filter |
| A04 `/admin/users/[id]` | Public/account summary, status, related calls/reports, wallet link | Suspend/restore, delete per policy; reason and confirmation, audit trail; admin access grants require separate controlled permission |
| A05 `/admin/reports` | Open/Under review/Resolved/Rejected tabs, reason/date filters, report queue | Assign/review if supported, open report, stale-list refresh |
| A06 `/admin/reports/[id]` | Reporter/reported references, reason, description, permitted evidence, related context, action history | Mark under review, resolve/reject with reason, suspend user if authorized; no blanket access to private chats |
| A07 `/admin/calls` | Caller/receiver, type/status/date/duration, charged amount; search/filter | Metadata detail with lifecycle/error/billing references; no live audio listening or recording control |
| A08 `/admin/payments` | Razorpay order/payment references, amount, status, user, received/verified times | Detail and reconciliation status; pending/failed/duplicate events displayed accurately |
| A09 `/admin/payments/[id]` | Payment timeline, webhook processing, ledger credit reference, refunds | Recheck status or authorized refund; confirm exact amount/reason; prevent duplicate processing |
| A10 `/admin/wallets/[userId]` | Balance, ledger, linked call/recharge, filters | Authorized adjustment with signed amount/reason/confirmation; no unrestricted balance text editor |
| A11 `/admin/pricing` | Audio/video rate, minimum balance, billing unit/rounding/grace settings when supported, effective date | Draft/save/publish confirmation; existing call rate snapshot remains visible |
| A12 `/admin/settings` | Maintenance, minimum version, support contacts, policy URLs, recharge packs, new-user bonus and feature flags | Validation, unsaved changes, save confirmation; unsupported growth flags remain deferred |
| A13 `/admin/announcements` | Message editor, audience, preview, delivery status/history | Draft and explicit send confirmation; failed/partial delivery handling |
| A14 `/admin/analytics` | Registrations, DAU/MAU, retention, call funnel/duration/minutes, recharge counts/amounts, revenue | Date/granularity filters; metric definition; authorized export if implemented |
| A15 `/admin/audit` | Actor, timestamp, action, entity, result, reason; search/filter | Read-only detail and permitted before/after; never expose secrets |
| A16 `/admin/reconciliation` | Razorpay versus ledger totals, unmatched payments, delayed events, refunds | Inspect discrepancy, safe retry of eligible reconciliation, dated resolution note |

## 7. Deferred feature coverage

These are named in the plan but are not part of the initial implementation. They need a product contract before enabling the corresponding UI. The table preserves visibility without silently expanding scope.

| ID | Later screen set | Required specification before implementation |
| --- | --- | --- |
| F01 | Ratings list and review detail | Eligibility, editing, moderation and aggregation |
| F02 | Gift catalog, confirm gift, gift receipt | Ownership, price, charging and whether recipients receive any benefit; no implicit payouts |
| F03 | Following/followers list and availability alerts | Privacy, follow/unfollow and notification controls |
| F04 | Story feed/viewer/create | Audience, expiry, media moderation and reporting |
| F05 | Voice-note recorder, preview, playback | Permission, cancellation, duration/upload limits and playback |
| F06 | Group list/create/detail/chat | Roles, membership, privacy and moderation; no room model in current one-to-one UI |
| F07 | Subscription plans and management | Benefits, billing provider/store behavior and cancellation |
| F08 | Referral invite and reward history | Eligibility, verification and reward rules |
| F09 | Promotions list and offer detail | Eligibility, validity, terms and backend price application |

## 8. Interaction acceptance matrix

| Flow | Screens | Required observable outcome |
| --- | --- | --- |
| Join and personalize | M01–M05, M29 | Validation, retry and session-dependent routing work; profile persists after confirmed save |
| Find a person | M06–M10 | Query/filter/favorite changes are visible and back preserves context |
| Exchange messages/media | M11–M14 | Text send, retry, receipts and supported media states are represented |
| Call a person | M15–M21, M42–M44 | Incoming/outgoing states, controls, termination and history agree |
| Recharge and inspect money | M22–M27, M44 | Razorpay handoff and backend verification are distinct; amounts agree everywhere |
| Manage account and safety | M28–M42 | Edit/preferences/block/report/logout/deletion each show actual pending/success/failure outcomes |
| Operate platform | A01–A16 | Authorized admin action has confirmation, result and audit evidence |
| Service interruption | M45 and inline states | Recoverable error gives next action; stale data is identified |
| Later features | M46, F01–F09 | Hidden while disabled; defined separately before enablement |

## 9. Implementation and handoff rules

- Use Expo Router routes for navigation; reusable feature components belong outside `src/app`.
- Keep the shared design system in `src/components/ui` and `src/constants` (or a dedicated theme directory). Avoid copying an entire screen to create a variant.
- API-facing feature state and local demo fixtures are separate. A preview mode may allow state selection, but production UI must not present demo payment/call success as real.
- Use one shared user record across discovery, chat and calls so names, avatar, age, status and language do not contradict one another.
- Use licensed local portrait assets or a user-uploaded photo; remote reference image links may expire. Avatar initials are the fallback.
- Use a consistent cross-platform icon set. Do not use random Unicode symbols as replacements for inaccessible controls.
- Keep public profile information separate from account data. Do not expose DOB, phone or financial information on public cards.
- Every active button either performs its stated UI action or explicitly reports an unavailable integration in preview mode. No decorative dead primary actions.
- Verify key screens at 360 × 800 and 430 × 932 plus large text. Verify tablet and desktop admin layouts separately. Check keyboard, Android back, long names, empty data, image failure, dark/light appearance, and the route skeleton state.

## 10. Reusable screen-generation brief

Copy this brief for each screen or feature batch:

> Build Talkative screen(s) [SCREEN IDS] using `Doc/TALKATIVE_UI_SPECIFICATION.md` and `Doc/TALKATIVE_DEVELOPMENT_PLAN.md`. Use the dark charcoal/mint design from the four supplied reference folders. Keep the canonical color/type/spacing tokens and shared components. Implement all content, navigation, actions and states specified for those IDs. Roles are normal user and administrator only. Razorpay is the recharge provider. Do not add roles, payouts, random matching, unsupported RTC claims or later features. Label fixture data and unavailable integrations in preview mode. Return the implemented routes/components, states verified, screenshots where available and remaining service dependencies. Update the coverage record below based on evidence.

## 11. Coverage record

This document specifies **46 mobile screen/overlay groups**, **16 admin screens**, and **9 deferred feature groups**. Screen groups include the variants described above; these numbers are not counts of completed implementation routes.

| Deliverable | Status |
| --- | --- |
| Updated product requirements read | Complete |
| Design system and all four PNG references reviewed | Complete |
| Reference HTML structure/interactions inspected | Complete |
| Mobile screen and reusable component specification | Complete |
| Admin screen specification | Complete |
| Future-feature boundaries recorded | Complete |
| App implementation and visual verification | Interactive preview implemented; scope, spot checks and remaining integration work are recorded in `TALKATIVE_UI_HANDOFF.md` |
