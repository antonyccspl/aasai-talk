# Browser background call alerts

Approved Hosts can opt in to system notifications for incoming calls while Aasai Talk is in the background. The Web Push implementation uses standard browser service-worker and Push APIs and works in supported current versions of Chrome, Edge, Firefox, and Safari. A registered browser push subscription keeps an approved Host available after browser heartbeat timers are suspended, provided the Host is accepting calls and has call notifications enabled. The existing in-page ringtone remains active while the site is open. Browser notifications require HTTPS, notification permission, and the browser/device's notification sound to be enabled; the site cannot control the system sound or provide a repeating ringtone from a suspended tab. Browser battery, background, or notification settings may affect delivery.

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

Deploy the updated web app to Vercel (its build command runs `npm run build:web`) and deploy the updated `push-notifications` Edge Function after setting the VAPID secrets. An approved Host then signs in, opens **Settings → Notifications**, selects **Enable browser call alerts**, and allows notifications in the browser prompt. On iPhone/iPad, first install and launch the Home Screen web app as described above. Keep the Host's call availability enabled. To test, background the browser or installed web app and place a call from a male account. Clicking the system notification opens the incoming-call screen.
