# Browser background call alerts

Approved Hosts can opt in to system notifications for incoming calls while the Aasai Talk tab is minimized. The existing in-page ringtone remains active while the site is open. Browser notifications require HTTPS, notification permission, and the browser/device's notification sound to be enabled; the site cannot control the system sound or provide a repeating ringtone from a suspended tab.

## One-time Supabase setup

From the repository root:

1. Apply the subscription-table migration to the Aasai Talk project:

   ```powershell
   supabase db push
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

Deploy the updated web app to Vercel. An approved Host then signs in in the browser, opens **Settings → Notifications**, selects **Enable browser call alerts**, and allows notifications in the browser prompt. To test, keep the browser open but minimize the Aasai Talk tab and place a call from a male account. Clicking the system notification opens the Calls screen.
