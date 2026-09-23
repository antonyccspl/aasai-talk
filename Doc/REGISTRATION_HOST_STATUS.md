# Registration and Host flow implementation status

- Native gallery and camera selection now use Expo ImagePicker, handle cancellation and errors, and show the selected image in registration, profile and host draft.
- Android/iOS birthday selection uses a native date picker with calendar-based 18+ validation.
- Demo phone login currently captures the normalized phone number locally and
  accepts OTP `123456` with a 30-second resend cooldown. A completed profile is
  remembered per phone number so returning users skip onboarding. Firebase
  Phone Auth can replace this adapter later.
- Registration completion opens Explore. Logout clears session photo, personal profile fields, messages, drafts and call history, dismisses navigation history, and guards private routes until registration/login completes again.
- Settings exposes Become a Host. The draft wizard includes profile, languages, interests, call preferences, diamond rates, verification explanation and review. Normal registration has no host role selector.
- Aadhaar and PAN selectors accept image or PDF files and retain only the selected filename in the current session. The application can be submitted into the local `PENDING REVIEW` state; no host is approved automatically.
- The Host earnings screen supports UPI ID or bank-account/IFSC withdrawal requests, a ₹100 minimum, pending status, and in-session history. It only unlocks for an approved Host state.

## Backend work blocked by missing connection

No Supabase client, project configuration, authenticated backend or private storage exists in this workspace. Photos and verification documents are local previews, not uploaded assets. Production functionality still needs Supabase Auth, private verification storage, RLS, server-validated rates, authenticated admin review with audit logs, approval notifications, approved-host controls, and a separate host earnings/withdrawal ledger with server-side minimum-balance checks.

Connect a Supabase project and its public client configuration before enabling these operations. Never place a service-role key in the mobile app. Admin approval and financial eligibility must be controlled by authenticated server logic.
