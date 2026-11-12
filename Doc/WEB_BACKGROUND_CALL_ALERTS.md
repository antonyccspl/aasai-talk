# Browser background call alerts

Approved Hosts can opt in to system notifications for incoming calls while Aasai Talk is in the background. The Web Push implementation uses standard browser service-worker and Push APIs and works in supported current versions of Chrome, Edge, Firefox, and Safari. Availability now requires explicit Go Online intent and a server-recorded heartbeat within the configured timeout. A saved push subscription alone never keeps a Host Online. Web heartbeats run every 30 seconds even when hidden; the default five-minute timeout tolerates ordinary browser timer throttling. A fully frozen tab cannot be distinguished reliably from a closed browser and expires if it cannot heartbeat for the full timeout. The existing in-page ringtone remains active while the site is open. A background push displays a persistent, non-silent system notification with a vibration pattern where supported. The actual sound and vibration depend on browser, operating system, and device notification settings; a web page cannot force a custom or continuous ringtone while suspended. Browser battery, background, or notification settings may also affect delivery.

On iPhone and iPad, background Web Push is supported only from an installed Home Screen web app on iOS/iPadOS 16.4 or newer, regardless of which browser is used for ordinary tabs. In Safari, use **Share → Add to Home Screen**, open Aasai Talk from the new icon, sign in, and enable browser call alerts in **Settings → Notifications**. Ordinary iPhone/iPad browser tabs cannot receive background call alerts.

## One-time Supabase setup

From the repository root:

1. Apply the required migration(s) to the Aasai Talk project. If historical out-of-order migrations cause `supabase db push` to refuse, do not use `--include-all`; apply only the intended migration and record its version after verifying the SQL:

   ```powershell
   supabase db query --linked --file supabase/migrations/20261111000200_reachable_web_push_hosts.sql
   supabase migration repair --linked --status applied 20261111000200
   ```

2. Generate a VAPID key pair:

   ```powershell
   node scripts/generate-web-push-vapid-keys.mjs
   ```

3. Store the generated key values in `supabase/.env.web-push`:

   ```dotenv
   WEB_PUSH_VAPID_PUBLIC_KEY=<generated publicKey>
   WEB_PUSH_VAPID_PRIVATE_KEY=<generated privateKey>
   WEB_PUSH_SUBJECT=https://aasai-talk.vercel.app
   ```

   Keep this file private. The private key must never be committed or added to a browser/Vercel environment variable.

4. Upload the secrets and deploy the function:

   ```powershell
   supabase secrets set --env-file supabase/.env.web-push
   supabase functions deploy push-notifications
   ```

The function returns only the VAPID public key to the signed-in browser. The private key stays in Supabase secrets.

## Deploy and enable

Deploy the updated web app to Vercel (its build command runs `npm run build:web`) and deploy the updated `push-notifications` Edge Function after setting the VAPID secrets. An approved Host then signs in, opens **Settings → Notifications**, selects **Enable browser call alerts**, and allows notifications in the browser prompt. On iPhone/iPad, first install and launch the Home Screen web app as described above. Keep the Host's call availability enabled. Select **Send browser test alert** to verify push delivery on that device. Then background the browser or installed web app and place a call from a male account. Clicking the system notification opens the incoming-call screen.


## Availability lease update (20261111000300)

Apply migrations 20261111000100 and 20261111000200 first if not already installed, then apply **20261111000300_host_availability_lease.sql**. Deploy both **host-presence** and **push-notifications**, then deploy the web build. Do not publish the new frontend against the old functions. The new migration installs pg_cron and schedules expired invitation cleanup every minute; verify the job is active and successful in Supabase Cron. Online status is computed from server time at directory lookup and call creation/acceptance, independently of whether cron has run.

Hosts open Settings → Availability and choose Go Online. This requests notification permission within the click gesture, registers this browser with VAPID, and saves availability. Go Offline and web logout disable new calls immediately and end outstanding invitations. Existing connected calls and settlement are retained. Existing hosts with accepting_calls=false must opt in once after rollout.

The two availability states are ONLINE (returned as Available by the existing directory API) and OFFLINE. Busy remains the existing call occupancy display. Presence remains account-wide: the most recent heartbeat from any signed-in device maintains the account lease. Go Offline applies across devices. There is no per-device sign-out lease in this architecture. Last-seen history and availability intent survive connection expiry; a healthy resumed session renews presence unless the Host manually went Offline. The same server timeout also bounds native host presence; a native app whose background runtime stops heartbeats will expire after this interval.

To change the timeout as a database administrator (120–3600 seconds):

```sql
update public.host_presence_config set timeout_seconds = 300 where singleton;
select jobname, schedule, active from cron.job where jobname = 'expire-host-presence';
```

Notification Accept opens/focuses the incoming call screen and invokes its existing authenticated acceptance flow; Reject opens/focuses the site and invokes the rejection flow. Platforms without action buttons can open the notification body and use the screen controls. A stale notification routes to call history. Server acceptance rejects expired, cancelled, or unavailable invitations before Zego starts. System sound remains OS-controlled.

The caller awaits notification-provider acceptance before displaying Ringing. Missing devices, rejected/expired subscriptions, and failed delivery become unreachable and close the pending invitation. Provider acceptance is not proof of display or sound: the OS can still delay or suppress a notification. Such invitations retain the existing response timeout. A failed native delivery does not discard a successful browser delivery.

## Verification

Automated local checks:

- npm run typecheck
- npm run build:web
- node scripts/check-web-background-calls.mjs
- node scripts/check-call-lifecycle.mjs
- node scripts/check-zego-lifecycle.mjs
- Install isolated SQL test runtime: npm install --prefix node_modules/.presence-tests --no-package-lock @electric-sql/pglite
- node scripts/check-host-presence.mjs

The SQL test runs the new functions in actual embedded PostgreSQL with isolated fixtures. It tests delayed heartbeats, server expiry, directory/call admission agreement, Offline overriding later heartbeats, valid/expired acceptance, configurable timeout, and access restrictions. It does not execute pg_cron. Browser tests simulate service-worker and lifecycle events, including Accept/Reject navigation and expired pushes. These are not substitutes for OS-level push testing.

Post-deployment two-account acceptance checklist (not yet executed on live devices):

| Scenario | Expected result |
| --- | --- |
| A: Go Online | Available in directory; call creation succeeds |
| B: Minimize for more than five minutes | Heartbeats continue under ordinary throttling; stays Available and receives system alert |
| C: Switch tabs for more than five minutes | Same as B |
| D: Close every signed-in client | Offline after five minutes from last server heartbeat; directory refresh can add about five seconds |
| E: Shut down computer | Same expiry as D |
| F: Disconnect internet | Same expiry as D; network recovery renews presence |
| G: Go Offline | New call creation denied immediately; pending invitation ends; next directory refresh removes Online status |
| H: Receive while minimized | Accept focuses/opens incoming screen, server validates, existing Zego audio/video starts; Reject ends invitation |
| Multiple clients | Closing one client does not expire a host still heartbeating elsewhere; manual Offline remains account-wide |
| Push unavailable | No devices, denied subscription or provider rejection produces unreachable, with no lingering invitation |
| Delayed action | Clicking an expired/cancelled notification cannot connect or start billing |

Current unrelated regression: scripts/check-call-fixes.mjs expects a 64-character hexadecimal Zego secret to be rejected, while the existing decoder accepts it. No Zego secret parsing changes were made for this task.

## Supabase deployment verified — 12 November 2026

- Project: vnpxbqcemqcsyxbunqvf.
- Prerequisites 20261111000100 and 20261111000200 were already applied.
- Applied 20261111000300_host_availability_lease.sql and recorded its migration version.
- Deployed host-presence and push-notifications; both report ACTIVE, version 22.
- Preserved the existing VAPID secrets; no key rotation was performed.
- Verified production timeout is 300 seconds and the directory query succeeds.
- Verified expire-host-presence is active every minute. Its first observed run succeeded at 10:31 IST on 12 November 2026.
- Both deployed endpoints returned the expected 401 response for an unauthenticated request.
- This verification covers the Supabase backend. The updated frontend/service worker still needs a website deployment; actual signed-in, two-device push/call testing remains pending.

## Go Online compatibility fix — 12 November 2026

This update supersedes the earlier requirement that Go Online must register browser push first. Approved hosts can now enable availability without notification permission or a push subscription. Background alerts remain an optional setup in Settings → Notifications. A browser lacking Web Push must keep the page visible to receive invitations reliably.

Added migration 20261112000100_foreground_call_receipt.sql. The visible host page sends a Firebase-authenticated receipt through host-presence; only the service role can call the receipt database function, and it checks the host, invitation age, availability, and ringing status. If push is unavailable or fails, push-notifications waits up to four seconds for this receipt before declaring the call unreachable. A saved subscription or a recent heartbeat alone is never treated as confirmed receipt.

The Go Online button now saves availability directly. Errors retain their specific message instead of being replaced with the generic availability error. Presence and push requests use AbortController timeouts without requiring the newer AbortSignal.timeout API.

The migration and both Edge Functions have been deployed. Local typecheck, web export, PostgreSQL regression tests and mocked browser/Edge Function tests passed. Deploy the updated frontend to Vercel and refresh both caller and host pages to activate this flow. End-to-end testing on the user's browser remains pending.
