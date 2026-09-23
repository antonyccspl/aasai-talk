# Database-backed sample app — 15 September 2026

This supersedes the earlier integration status. The app is in sample mode, not production mode.

## Connected

- Live coin packs and receiver-slab rate labels, with loading/retry states.
- Database-backed `directory_profiles` list, refreshable from Explore. The app no longer reads people from the sample-workspace fixture.
- Profile, photo URI, preferences, theme, favorites and blocks.
- Messages, drafts, notifications, read state and call history.
- Simulated wallet transactions and balances.
- Host application metadata/status, sample earnings and withdrawals.
- Reports, ratings, deletion-request metadata and admin edits/audit history.

The app loads database state before mounting screens. Changes are queued and saved with revision checks. Failed saves remain pending and show Retry. Logout preserves workspace history.

## Architecture

Migration 006 creates `demo_private.templates` and private workspaces. RPCs `open_demo_workspace` and `save_demo_workspace` load/save an installation-specific sample snapshot. A random 256-bit capability token is kept in native SecureStore or browser localStorage; only its hash is stored in the database. Direct private-table access is denied. Live catalog writes remain backend-only. Migrations 007–008 move the supplied discovery records to the public `directory_profiles` table and remove the people fixture from the workspace template. Migration 009 replaces temporary text identifiers with opaque UUID primary keys and reserves `firebase_uid` for real authenticated ownership. `display_name` is intentionally not unique.

This is not authenticated account storage or cross-device synchronization. Losing the installation token loses access to that sample workspace. Production wallet, KYC and ledger tables are untouched by demo actions.

## Remaining limitations

- Calls, payments and payouts remain simulated; no money moves.
- Dummy phone OTP `123456` is active until Firebase Phone Auth is integrated.
  Dummy-auth registrations are stored in `phone_identities`, and onboarding
  details including gender and date of birth are stored in the structured
  `phone_profiles` table as well as the legacy identity JSON snapshot. The
  existing `profiles` table remains reserved for real Supabase-authenticated
  users.
- Gallery photo URIs and KYC filenames are metadata only, not uploaded files.
- Deletion requests persist; automatic 15-day erasure is not enabled.
- Some admin analytics, payment/reconciliation examples and help/policy content remain illustrative. Admin form saves do not modify production configuration or process refunds.
- Call charging remains sample client logic, not authoritative server billing.
- No multi-user realtime messaging or production admin authorization.
- Concurrent tabs can conflict; stale writes are rejected. Force-closing before a pending save finishes can lose the latest change.

The whole app is therefore not yet production-complete. External integrations are intentionally excluded, but the remaining illustrative admin/content screens also need further binding before claiming every screen is dynamic.

## Checks

Run `npm.cmd run typecheck`, `node scripts/check-sample-backend.mjs`, `npx.cmd supabase db lint --linked`, and Android/web Expo export. The backend test covers seeds, catalogs, save/reload, isolation and rejected stale/invalid requests. Physical-device acceptance testing is still required.

Before public release, replace sample authority with authenticated owner-scoped records, protected uploads, server billing and admin roles. Rate-limit or disable sample RPCs and add retention. Rotate the secret key previously shared in chat; it is not included in the Expo client.
