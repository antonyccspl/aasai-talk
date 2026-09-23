# Supabase integration status

Project: aasaitalk-dev (`vnpxbqcemqcsyxbunqvf`).

## Connected

- Coin-pack catalog reads live active rows from Supabase REST, including database prices on recharge review.
- Call cards, profile rate labels and call-screen rate labels read active receiver slabs.
- Sample slabs: AUDIO 2 diamonds/minute, VIDEO 5 diamonds/minute, 10 coins/diamond and 0.50 coins/rupee. No existing slab rows were overwritten.
- Public configuration is bundled, with EXPO_PUBLIC environment overrides. No secret key is included.
- Active catalog rows are publicly readable; client writes and inactive rows are restricted.
- Wallet supports retry and pull-to-refresh. Explore refresh reloads rate configuration.

## Not yet connected

- The app currently uses a local demo phone/OTP adapter (`123456`) and captures
  the phone number for returning-user onboarding decisions. Firebase Phone Auth
  is intentionally deferred. Messaging, calls, and the remaining workspace
  state are still sample/local behavior.
- Profiles, Host applications and documents are not persisted by the app yet.
- Explore people, messages, call history, wallet balances and Host earnings remain sample/local state.
- No real call transport, server billing, payment verification or payout processing exists.
- Account-deletion table exists; deletion scheduling and execution are not implemented.
- Sample financial actions must not be treated as real transactions.

## External setup needed

- SMS provider and phone authentication configuration.
- Audio/video provider selection and credentials.
- Razorpay server credentials, webhook configuration and payout setup.
- Host revenue-share and billing rounding rules before implementing money movement.

## Verification

- Live REST requests with the publishable key returned six coin packs and both sample slab rows.
- TypeScript check passed.
- Linked database lint reported no schema errors.
- Mobile network behavior still requires testing on the user's device.
