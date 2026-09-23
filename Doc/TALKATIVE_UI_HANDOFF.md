# Talkative UI — Implementation Handoff

Updated: 14 September 2026.

## What is delivered

The Expo starter now contains a navigable mobile UI and responsive admin UI preview using the supplied dark charcoal/emerald visual references, Plus Jakarta Sans, JetBrains Mono, and Feather icons. Product naming is Talkative, participants are ordinary users, and payment screens use Razorpay.

The reusable screen specification is [TALKATIVE_UI_SPECIFICATION.md](TALKATIVE_UI_SPECIFICATION.md). It defines 46 mobile screen/overlay groups, 16 admin screens and nine deferred feature groups. The in-app screen library links to the mobile/admin groups, including failure states.

## Open the UI

From `D:\Documents\Basic Components\Talkative\Talkative`:

```powershell
npm run android
```

For a compiled browser preview:

```powershell
npm run build:web
npm run preview:serve
```

Open `http://127.0.0.1:8085/explore`, `/preview` for the screen library, or `/admin` for the desktop admin preview. The web build uses SPA routing so deep links resolve through the included local server.

## Reusable source split

| File/directory under the Expo project | Responsibility |
| --- | --- |
| `src/ui/theme.ts` | Canonical colors and typography |
| `src/ui/components.tsx` | Shared shell, headers, dock, cards, buttons, fields, chips, avatars, badges, rows and error/empty states |
| `src/ui/store.tsx` | Shared in-memory demo records, favorites, blocks, profile, messages, calls and wallet state |
| `src/ui/social.tsx` | Discovery, filters, favorites, profile, conversations, chat and attachment/media previews |
| `src/ui/calls.tsx` | Incoming/outgoing, audio/video, results and history |
| `src/ui/wallet.tsx` | Wallet, pack selection, Razorpay handoff/results and ledger screens |
| `src/ui/account.tsx` | Onboarding, account, permissions, safety, notifications and service states |
| `src/ui/admin.tsx` | Responsive admin preview across the 16 admin screen groups |
| `src/ui/registry.ts` | Stable screen IDs and route links |
| `src/app/[...route].tsx` | Expo Router route dispatcher |

## Working preview interactions

- Phone input validation, Supabase phone OTP, profile editing and language/interest selection.
- Search and combined directory filters; favorites and local blocking.
- Text message sending, failed-send retry, draft preservation, sample attachment, typing preview and unread-state changes.
- Incoming/outgoing call outcomes, connected audio/video UI, mute/camera/audio route controls, timer, call history, ongoing-call navigation and end-call action.
- Recharge pack/custom amount selection, recharge review and all payment result variants; explicit in-memory sample credit with a recorded order key to prevent repeat demo credit.
- Availability, preferences, notification reading, block/report, logout/deletion confirmations and rating variant.
- Admin list/detail navigation, searches where relevant, forms, confirmation dialogs and page-local action feedback/audit preview.

## Service boundaries and remaining integration work

This is a **UI prototype**, not a finished production backend. Authentication
now uses Supabase phone OTP and onboarding profiles are persisted, but the
workspace state is still sample data. No real calls, camera/microphone access,
push delivery, media upload, payment, refund, or payout processing is performed.

Connect Supabase Auth/data/RLS, RTC, native media and permission handling, push and Razorpay before replacing preview states with real service outcomes. Legal text and support contacts are visibly unconfigured. Remote reference portraits have an initials fallback. Rating and other deferred features remain outside the initial product scope; only the optional rating UI is previewed.

The admin UI is currently a web-responsive preview route inside the Expo project, with its own source module. The separate authenticated/deployable admin application in the development plan remains an integration/deployment step.

Some modal/sheet groups are presented as navigable confirmation/detail screens in this first implementation. Native calling overlays, gestures, platform permission prompts, media playback and production admin pagination are not established by this UI preview.

## Verification

- TypeScript `tsc --noEmit`: passed during implementation; rerun after edits.
- Expo web export: passed; the local compiled browser preview loaded successfully.
- Expo Android/Hermes export: passed outside the sandbox, whose process restrictions initially blocked Hermes.
- Browser spot checks: Explore layout, Wallet navigation and pack/CTA selection, Chat layout and sending a local message, outgoing-to-connected audio navigation and active-call rendering.
- A short-screen call-control issue was identified during visual inspection and fixed by moving the control dock into the fixed footer.
- Full Android device interaction, every state on every screen, iOS, large-text and complete responsive regression are not yet verified.

## Useful commands

```powershell
npm run typecheck
npm run build:web
npm run build:android
npm run format:ui
```
