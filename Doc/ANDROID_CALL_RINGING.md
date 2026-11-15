# Android audio/video ringing

- Caller: local ringback starts after a ringing session is created. Audio defaults to earpiece; video defaults to speaker. Speaker toggle is available before acceptance and carries into the connected call.
- Host: the system-selected ringtone plays while the incoming call screen is active. Silent/vibrate mode, zero ring volume and Do Not Disturb are not overridden. Existing vibration remains.
- Tones stop on accept, decline, cancel, remote end, screen cleanup, app backgrounding and audio focus loss. Native ringing has a 60-second safety cutoff.
- A native Android rebuild is required, not just a JavaScript reload. `native/CallSoundsPackage.kt` and `plugins/with-call-sounds.js` preserve the module through Expo prebuild.
- Microphone permission and MODIFY_AUDIO_SETTINGS are included in the native manifest and app configuration.

## Android Host calls

Android remote notifications and background-call alerts are disabled. Hosts
must keep Aasai Talk open and call availability enabled to receive calls. Test
the foreground call behavior below; background or force-stopped delivery is not
supported.

## Test on both devices

1. Install the new development APK on both devices and load the same Metro server.
2. Keep both apps open. Set the Host phone to normal ring mode and raise ringtone volume.
3. Start an audio call. Check caller ringback through the earpiece, then toggle speaker. Host should hear its selected ringtone and immediately see Accept/Decline.
4. Accept: both ringing sounds must stop before RTC media begins. Check two-way audio and speaker switching.
5. Repeat with video. Check remote video, local inset preview, camera flip, mute and camera toggle.
6. Test cancel before acceptance, reject, no answer and rapid accept/cancel. No sound should remain after the call ends.

The in-app ringing checks above verify foreground behavior. iOS ringtone and
native call-screen integration are not implemented.
