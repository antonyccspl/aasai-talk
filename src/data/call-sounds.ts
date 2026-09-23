import { NativeModules, Platform } from "react-native";

type CallSounds = {
  start(key: string, incoming: boolean, speaker: boolean): Promise<boolean>;
  stop(key: string): Promise<void>;
};
const native = NativeModules.CallSounds as CallSounds | undefined;

export async function startCallSound(key: string, incoming: boolean, speaker: boolean) {
  if (Platform.OS !== "android") return false;
  if (!native) throw new Error("Install the latest Android development build to enable ringing sounds.");
  return native.start(key, incoming, speaker);
}

export async function stopCallSound(key: string) {
  await native?.stop(key);
}
