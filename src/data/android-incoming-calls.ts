import { Platform } from "react-native";

type CallKeepModule = typeof import("react-native-callkeep");

function callKeepModule(): CallKeepModule {
  return require("react-native-callkeep") as CallKeepModule;
}

const callUuidPattern = /^[0-9a-f-]{36}$/i;

export function endAndroidCallUi(uuid: string) {
  if (Platform.OS !== "android" || !callUuidPattern.test(uuid)) return;
  callKeepModule().default.endCall(uuid);
}
