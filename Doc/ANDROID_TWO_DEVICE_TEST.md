# Phone and emulator startup

The emulator APK was built successfully on 21 September 2026 with Zego included, then installed on `emulator-5554`.

Use the app root: `D:\Documents\Basic Components\Talkative\Talkative`.

1. Keep one Metro server running in a terminal:

   ```powershell
   npx.cmd expo start --dev-client --port 8081 --lan --max-workers 2
   ```

2. In another terminal, install/open the emulator app without starting a second Metro server:

   ```powershell
   npm.cmd run android:emulator
   ```

   This command targets `emulator-5554`. If the emulator has another serial, use `npx.cmd expo run:android --device <serial> --no-bundler --port 8081`.

3. Connect the phone with USB debugging enabled and approve its USB debugging prompt. List devices:

   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
   ```

4. Forward Metro to each device (replace `PHONE_SERIAL` with the actual identifier):

   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s PHONE_SERIAL reverse tcp:8081 tcp:8081
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 reverse tcp:8081 tcp:8081
   ```

   Open the development app and connect to `http://127.0.0.1:8081`. If the phone needs a new native build, run `npx.cmd expo run:android --device PHONE_SERIAL --no-bundler --port 8081` after the emulator build finishes. The emulator APK contains x86_64 libraries; do not install it on an ARM phone.

5. Sign in with different accounts on the two devices and grant camera/microphone permissions before testing the call invitation and media. Emulator camera/microphone behavior depends on its virtual-device configuration.

Keep Gradle builds sequential. Metro can remain open throughout. A successful build is confirmed only by `BUILD SUCCESSFUL` and a zero exit code. Gradle/CMake deprecation or cross-drive hard-link copy warnings alone do not mean the build failed.

During repair, the existing Metro server was unresponsive and was restarted. Only the emulator was connected to ADB at verification time; a phone-to-emulator media call has not yet been verified.
