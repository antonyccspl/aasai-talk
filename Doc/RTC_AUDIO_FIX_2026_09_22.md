# Two-way audio diagnosis

## Findings and changes

- The call timer updates shared state every second. `onMediaError` depended on the entire shared state object, and the Zego setup effect depended on that callback. Each update could destroy/recreate the singleton engine. The callback is now stable, and media callbacks are read through refs rather than used as engine-lifecycle dependencies.
- Singleton startup/cleanup are serialized to avoid an old screen destroying a newer engine.
- Explicitly select the microphone source, enable capture, unmute the microphone/speaker according to controls, and set normal SDK capture/playback levels. Device volume and privacy controls are not overridden.
- Both publishing and playback must report ready before displaying Connected. Command completion alone does not prove media is flowing.
- Development logs report publisher/player error codes and numeric local/remote sound levels every five seconds. No audio is recorded by these diagnostics.
- `scripts/check-zego-lifecycle.mjs` exercises the actual component with mocked native dependencies and verifies that callback rerenders do not restart RTC, mute controls operate in place, and cleanup runs once.

## Device verification

The Pixel 6a emulator was cold-started and the APK containing microphone and audio-routing permissions installed. ADB showed RECORD_AUDIO not granted. Allow the permission when the app asks; Android settings/privacy controls are not bypassed.

For emulator microphone input, check Extended controls → Microphone and the host microphone input setting, plus Windows microphone access for desktop apps. The AVD has `hw.audioInput=yes`, but actual Windows microphone input still needs a spoken test.

The physical USB phone was not connected during this verification. It still needs the current APK installed and a two-device spoken audio/video test. Keep both development apps connected to Metro on port 8081.

## Useful diagnostics during a call

- `[RTC] microphone level`: local capture activity. Zero while speaking suggests permission, privacy toggle, muted mic or emulator host input.
- `[RTC] received audio level`: decoded remote audio activity. Nonzero with silence suggests speaker/output volume or route.
- `[RTC] publisher state` / `[RTC] playback state`: SDK state and error code; report a nonzero code when troubleshooting.

Both users should test speaking in turn with headphones or sufficient separation to avoid echo. Do not treat a successful build or room login as proof that speech is audible.
