# Supabase integration status

Project: aasaitalk-dev (`vnpxbqcemqcsyxbunqvf`).

## Connected

- Coin-pack catalog reads live active rows from Supabase REST, including database prices on recharge review.
- Call cards, profile rate labels and call-screen rate labels use fixed caller pricing: 2 diamonds (20 coins)/minute for audio and 4 diamonds (40 coins)/minute for video.
- Hosts earn a fixed ₹5/minute for audio and ₹10/minute for video. Coin-pack conversion is 1.5 coins per ₹1, while each call diamond is worth 10 coins.
- Public configuration is bundled, with EXPO_PUBLIC environment overrides. No secret key is included.
- Active catalog rows are publicly readable; client writes and inactive rows are restricted.
- Wallet supports retry and pull-to-refresh.

## Not yet connected

- The app currently uses a local demo phone/OTP adapter (`123456`) and captures
  the phone number for returning-user onboarding decisions. Firebase Phone Auth
  is intentionally deferred. Messaging, calls, and the remaining workspace
  state are still sample/local behavior.
- Profiles, Host applications and documents are not persisted by the app yet.
- Explore people, messages and call history remain sample/local state.
- No real call transport, payment verification or payout processing exists.
- Account-deletion table exists; deletion scheduling and execution are not implemented.
- Sample financial actions must not be treated as real transactions.

## External setup needed

- SMS provider and phone authentication configuration.
- Audio/video provider selection and credentials.
- Razorpay server credentials, webhook configuration and payout setup.
- The fixed-price migration must be deployed to Supabase before live wallet and Host earnings use the new policy.

## Verification

- The web export build passes.
- The repository TypeScript check currently has unrelated pre-existing stylesheet-module resolution failures.
- The fixed-price migration remains pending deployment to the linked Supabase project.
