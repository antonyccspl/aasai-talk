# Aasai Talk

Aasai Talk is an Expo/React Native social discovery app backed by Supabase Auth
for phone login, designed to use Twilio Verify for SMS delivery. Phone
verification uses Supabase Auth and Twilio Verify, not Firebase Authentication.
The implementation includes profile and public directory data, messaging, call
lifecycle and minute billing, Host presence and dashboards, safety reports and
blocks, manual Host photo review, push notification plumbing, and a moderator
operations view. Live two-party RTC, payment checkout/webhooks,
withdrawals, push delivery, and moderator operations require the provider
credentials, database migrations, and Edge Functions described below.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npm run start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

The source is under `src/` and uses [Expo Router](https://docs.expo.dev/router/introduction).

## Environment

Copy `.env.example` to `.env.local` and provide the Supabase project URL and
publishable key:

```text
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Enable phone sign-in in Supabase Auth and choose Twilio Verify as the SMS
provider in the Supabase Dashboard. Enter the Twilio Account SID, Auth Token,
and Verify Service SID in the provider settings; never put them in the app,
`.env`, or source control. The app must never contain a Supabase
secret/service-role key.

## Push notifications

Android Firebase Cloud Messaging has been removed. Android remote push alerts
and background-call alerts are unavailable; Hosts must keep Aasai Talk open to
receive calls. iOS notifications continue to use Expo Push Service and APNs.
Supported browsers can receive call alerts through Web Push when VAPID is
configured. Call, message, wallet, and announcement preferences are under
Settings > Notification preferences and are saved per phone account. The
`20261018000100_phone_notification_preferences.sql` migration creates their
server-side storage. Announcement preferences control active announcements in
the in-app inbox; announcement push delivery is not implemented.

Apply the migrations and deploy `push-notifications`. The function verifies the
Supabase access token and derives call/message/wallet recipients from the server
records. It uses Supabase-managed service-role credentials only on the server.
The `host-presence` function also records online heartbeats for signed-in
members on web and mobile: approved Hosts update Host presence, while male
members update member presence. Apply
`20261019000100_track_male_member_online_presence.sql` and
`20261019000200_server_timestamp_member_presence.sql`, then deploy
`host-presence` before expecting these online counts in the admin portal.
Call availability is tied to the Host's active presence lease; Android Hosts
must keep Aasai Talk open to receive calls. iOS push alerts use APNs; browser
call alerts use Web Push where configured. Native iOS call UI is not
implemented.
Hosts can independently accept audio and video calls under Profile > Call
availability. Those preferences are combined with each Host's approved
capabilities, reflected in male members' call options, and enforced when a
call or video upgrade is requested. Apply
`20261020000100_host_call_acceptance_preferences.sql` and deploy the updated
`host-presence` function and app together. Existing Hosts default to accepting
both call types, subject to the types enabled in their approved Host profile.
When **Show last seen** is enabled, male users can see a Host's relative last
active time in Favorites and call history; switching it off hides that time.

Automatic photo scanning and live-call frame scanning are not used. App-
submitted Host photos remain private until a moderator approves them in the
admin Reports queue; admin-created Host photos require the manual safety
attestation. Live calls rely on existing reporting and moderation tools.

## Validation

```bash
npm run typecheck
npm run build:web
```

The live sample backend check requires `.env.local` and a linked Supabase
project:

```bash
node scripts/check-sample-backend.mjs
```

## Android release and Google Play

Android production builds use EAS Build. The Play Store build is an Android App
Bundle (`.aab`); the preview profile creates an installable APK. The Android
application ID is `com.aasaitalk.app`. Choose this ID before creating the Play
Console listing; it is a permanent identifier once the app is published.

Android push notifications and background call alerts are disabled. Do not add
`google-services.json` or configure FCM credentials for this app.

### Configure EAS Build

1. Create an Expo account at [expo.dev](https://expo.dev/), then from this
   repository run `npx eas-cli login` and `npx eas-cli init` to link the
   project to your Expo account.
2. In the linked EAS project's **production** environment, create
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with
   the same public values used by the working app. Add them to **preview** too
   if you will run preview builds. Do not upload a Supabase service-role key or
   any server credential; `EXPO_PUBLIC_` values are embedded in the app.
3. Build and install a test APK:

   ```bash
   npx eas-cli build --platform android --profile preview
   ```

   A successful EAS build only confirms that the APK compiled; the Supabase
   settings must also be present in the EAS **preview** environment. If the app
   cannot load its initial data, check the error details shown below the
   startup message for an HTTP status or missing RPC rather than assuming the
   device is offline.

4. Test Twilio-delivered phone sign-in, profile/photo permissions, chat, notifications,
   audio/video calls, and Cashfree flows on a real Android device. A successful
   web export does not verify native Android SDK integration.
5. Create the Play Store App Bundle when the Android test build is ready:

   ```bash
   npm run build:android
   ```

   EAS stores the Android signing key remotely and the production profile
   increments the Android build number. Keep the EAS account secure and do not
   replace or discard the signing key.

### 3. Create the Play Console developer account

1. Register at [Google Play Console](https://play.google.com/console/). Google
   currently charges a one-time US$25 registration fee and verifies the
   developer identity. Choose **Personal** if publishing as an individual;
   choose **Organization** only if publishing on behalf of a registered
   organization and you can complete its verification.
2. New personal accounts must also verify access to an Android device using
   the Play Console app. Before production access, Google currently requires a
   closed test with at least 12 testers opted in continuously for 14 days.
   Check the current Play Console requirements when registering.
3. Create the app in Play Console, select its default language and free/paid
   availability, and use the same public app name and package ID.

### 4. Complete the store setup and release

1. Prepare the listing: app name, short and full descriptions, app icon,
   screenshots, contact details, and a public privacy-policy URL.
2. Complete the app-content declarations, target audience, content rating, ads
   declaration, and Data safety form accurately for the data and providers the
   live app actually uses.
3. Upload the `.aab` to **Internal testing** first. Add testers, install from
   the Play testing link, check the Play pre-launch report, and fix issues.
4. If Play Console requires a personal-account closed test, move to **Closed
   testing**, recruit at least 12 opted-in testers, keep the test active for 14
   consecutive days, then apply for production access.
5. After approval, create a **Production** release, review the final country,
   listing, policy declarations, and rollout settings, then submit it for
   review.

Before requesting public release, verify that the live privacy policy and
account-deletion process satisfy Google Play policy. The current in-app
deletion flow submits a request for review; it does not itself complete
automatic data erasure. Social and messaging features also require accurate
user-generated-content disclosures and effective reporting/blocking
moderation.

References: [Expo SDK 57 build properties](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/),
[EAS build configuration](https://docs.expo.dev/build/eas-json/),
[Play Console account registration](https://support.google.com/googleplay/android-developer/answer/6112435),
[personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465),
and [current target API requirement](https://support.google.com/googleplay/android-developer/answer/11926878).

## Calling Phase 2

The Phase 2 call foundation is deployed in Supabase. `call_sessions` records
ringing, connected, ended, missed, rejected, and cancelled calls. The
`start_phone_call` RPC only permits a male phone profile to call an approved
female Host and returns a unique room ID. The `update_phone_call` RPC records
the lifecycle and duration. The client wrappers are in
`src/data/call-sessions.ts`.

The native call screen uses the React Native ZEGOCLOUD SDK. Browser calls use
`zego-express-engine-webrtc`; set `ZEGO_WEB_SERVER_URL` as a Supabase Edge
Function secret to the WebRTC server address for the same ZEGO project as
`ZEGO_APP_ID`. Keep the ServerSecret/AppSign in Edge Function Secrets only; do
not add it to `.env.local` as an `EXPO_PUBLIC_` value or ship it in the client.

Phone block, report, and account-deletion requests use the `phone-safety` Edge
Function. Before deploying it, link the Supabase project, configure Supabase
Phone Auth with Twilio Verify in the Dashboard, apply the migrations, and
deploy the functions:

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
npx supabase functions deploy host-payouts
npx supabase functions deploy content-moderation
npx supabase functions deploy host-presence
npx supabase functions deploy cashfree-payment-status
npx supabase functions deploy moderator-ops
npx supabase functions deploy zego-token
npx supabase functions deploy phone-safety
npx supabase functions deploy support-tickets
npx supabase functions deploy host-documents
npx supabase functions deploy cashfree-create-order
npx supabase functions deploy push-notifications
```

These functions verify Supabase Auth access tokens. The service-role key remains
a Supabase-managed server secret and must never be added to the client or Vercel
`EXPO_PUBLIC_` variables. Account deletion currently records a server request;
automatic data erasure still requires a scheduled server-side processor.

The moderator operations route requires an active `moderator` entry in
`admin_roles` for the Supabase Auth user. Provision that role only through a
trusted administrative process; do not grant it from the client. The
`moderator-ops` function checks the role, and report resolution writes a
server-side audit record.
Operations summaries include seven-day call completion/failure, open/high
priority reports, and Hosts with a heartbeat in the last minute.

The push and moderator migrations in this workspace are not applied merely by
adding these files. Run `npx supabase db push` against the intended project and
deploy the Edge Functions before enabling production use. iOS push delivery
depends on valid APNs provider credentials. Phone Auth also depends on
configuring Twilio Verify in the Supabase Dashboard and testing real SMS
delivery. The app's phone RPCs and financial flows still need production
validation before the wallet or calling features should be treated as
production financial services.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
