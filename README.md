# Aasai Talk

Aasai Talk is an Expo/React Native social discovery app backed by Supabase and
Firebase Phone Authentication. The implementation includes profile and public
directory data, messaging, call lifecycle and minute billing, Host presence and
dashboards, safety reports/blocks, push notification plumbing, and a moderator
operations view. Live two-party RTC, payment checkout/webhooks, withdrawals,
push delivery, and moderator operations require the provider credentials,
database migrations, and Edge Functions described below.

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
publishable key. For browser phone login, also add the public configuration from
your Firebase Console Web App:

```text
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

The mobile app must never contain a Supabase secret/service-role key.
Enable Phone sign-in in Firebase Authentication and add each browser host to its
Authorized domains. Use Firebase's fictional test numbers for development.
Firebase Web App configuration is public client configuration; never add a
Firebase service-account key or Supabase secret to the client.

## Push notifications

Remote notifications use `expo-notifications` and Expo Push Service. Link the
app to an EAS project, configure Android FCM v1 credentials (and APNs
credentials if enabling iOS), then build and install a development or release
client. Call, message, wallet, and announcement preferences are under Settings >
Notification preferences and are saved per phone account. The
`20261018000100_phone_notification_preferences.sql` migration creates their
server-side storage. Announcement preferences control active announcements in
the in-app inbox; announcement push delivery is not implemented. Browser push
is not available on the website. Approved Android Hosts also have an
**Accept calls while away**
switch under Profile > Call availability. Enabling it registers Android push
and the phone account used for the native incoming-call screen. The Host can
turn it off at any time; new calls are then blocked and any ringing invitation
is marked missed.

Apply the migrations and deploy `push-notifications`. The function verifies the
Firebase ID token and derives call/message/wallet recipients from the server
records. It uses Supabase-managed service-role credentials only on the server.
The `host-presence` function also records online heartbeats for signed-in
members on web and mobile: approved Hosts update Host presence, while male
members update member presence. Apply
`20261019000100_track_male_member_online_presence.sql` and
`20261019000200_server_timestamp_member_presence.sql`, then deploy
`host-presence` before expecting these online counts in the admin portal.
For Android background calls, the `host-presence` and `push-notifications`
functions and the `20261012000100_host_call_availability_last_seen.sql` and
`20261018000200_allow_android_host_calls_while_away.sql` migrations must also
be deployed. When a Host enables **Accept calls while away**, call availability
stays on after their activity heartbeat expires, and incoming calls continue
to be sent to their registered Android device. Android call pushes are data-only and are
presented by Android Telecom after the Host enables the feature and accepts the
phone-account prompt. The project must be rebuilt with EAS after native
CallKeep configuration changes. iOS keeps the existing alert notification
flow; native iOS call UI is not implemented.
When **Show last seen** is enabled, male users can see a Host's relative last
active time in Favorites and call history; switching it off hides that time.

Android may defer data-only pushes in battery-saving modes, and force-stopping
the app prevents background delivery until it is opened again. Validate calls
on a real Android device while the app is backgrounded and while the screen is
locked; an Expo web export does not exercise this flow.

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
application ID is `com.aasaitalk.app`. Choose this ID before registering the
Android app in Firebase or creating the Play Console listing: it is a permanent
identifier once the app is published.

### 1. Prepare Firebase for Android

1. In Firebase Console, register an Android app using the exact package name
   `com.aasaitalk.app`. Do not reuse the previous `com.anonymous.aasaitalk`
   Android registration.
2. Enable **Phone** under Authentication sign-in providers and allow the
   regions where the app will send verification SMS messages.
3. Download `google-services.json` and put it in the repository root, beside
   `app.json`. It is ignored by Git but included in EAS build uploads through
   `.easignore`; do not commit it.
4. After EAS creates the Android signing key, add its SHA-1 and SHA-256
   fingerprints to the Firebase Android app. Once Play App Signing is set up,
   add Google's Play app-signing certificate fingerprints too. These
   fingerprints are required for reliable phone-auth app verification.

### 2. Configure EAS Build

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

4. Test Firebase phone sign-in, profile/photo permissions, chat, notifications,
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
Function. Before deploying it, link the Supabase project, set
`FIREBASE_PROJECT_ID` as an Edge Function secret, apply the migrations, and
deploy the functions:

```bash
npx supabase link --project-ref your-project-ref
npx supabase secrets set FIREBASE_PROJECT_ID=your-firebase-project-id
npx supabase db push
npx supabase functions deploy phone-safety
npx supabase functions deploy zego-token
npx supabase functions deploy host-presence
npx supabase functions deploy push-notifications
npx supabase functions deploy moderator-ops
```

The function verifies Firebase ID tokens. Its service-role key remains a
Supabase-managed server secret and must never be added to the client or Vercel
`EXPO_PUBLIC_` variables. Account deletion currently records a server request;
automatic data erasure still requires a scheduled server-side processor.

The moderator operations route requires a Firebase custom claim
`moderator: true`. Provision that claim only through a trusted Firebase Admin
environment; do not grant it from the client. The `moderator-ops` function
checks the claim, and report resolution writes a server-side audit record.
Operations summaries include seven-day call completion/failure, open/high
priority reports, and Hosts with a heartbeat in the last minute.

The push and moderator migrations in this workspace are not applied merely by
adding these files. Run `npx supabase db push` against the intended project and
deploy the Edge Functions before enabling production use. Push delivery also
depends on valid EAS/FCM/APNs provider credentials. The app's existing phone
RPCs still need a broader Firebase-identity authorization audit before the
wallet or calling features should be treated as production financial services.

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
