# Call connection checks — 22 September 2026

## Confirmed failure

The emulator log reported `Only male users can start Host calls`. The account ending 9641 was saved as Female. With the owner's explicit approval, its gender was corrected to Male through the existing profile RPC. All other profile fields were verified unchanged.

## Changes

- Preserve Supabase error messages instead of displaying only a generic failure.
- Register incoming-call monitoring at the root, including the Explore tab.
- Poll participant call status because anonymous table reads are blocked by RLS; keep the table private.
- Observe rejection/end/cancellation on both devices, and expire unanswered invitations after 60 seconds when status is polled.
- Allow only the Host to accept; prevent terminal sessions from being reopened; calculate terminal duration on the server.
- Fix rejecting an incoming call without a local active-call object.
- Use the Zego ServerSecret for Token04, not AppSign; require acceptance before issuing media tokens.
- Request Android microphone/camera permissions and apply initial media controls.
- Render local video as an inset so it does not cover remote video.

## Deployment and checks

- Applied `20260922000100_call_status_lifecycle.sql` to the linked Supabase project.
- Deployed `zego-token` using the existing phone-login prototype authorization mode.
- `scripts/check-call-fixes.mjs` checks Token04 encryption/envelope/privileges and, with environment configuration, the deployed status RPC and denied direct table reads.

## Still required

1. Set `ZEGO_SERVER_SECRET` in Supabase Edge Function Secrets using the 32-byte ServerSecret from the SAME Zego project as `ZEGO_APP_ID`. Never put it in `EXPO_PUBLIC_*` or client code. Zego reference: https://www.zegocloud.com/docs/real-time-voice-android/communication/using-token-authentication
2. Reload both development clients from the same Metro server. Keep both apps open, log into different accounts, and grant permissions.
3. Verify audio, video, reject, cancel, end from either side, and no-answer behavior with the two devices. A real media connection has not yet been verified.

## Production limitations (not resolved by these fixes)

- Existing phone-login RPCs and token authorization trust the supplied phone number, not verified Firebase/Supabase identity. This remains a test-only flow, not production authorization.
- Background/killed-app incoming notifications require a push/call-invitation integration; foreground polling is not a replacement.
- Existing billing is based on call acceptance, not confirmed two-way media. Pricing, settlement concurrency, disconnect recovery and billing need a separate production audit before real charging.
- Old connected sessions do not yet have a heartbeat/lease expiry. Do not indiscriminately clear live sessions to bypass the active-call guard.
