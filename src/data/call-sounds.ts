import { NativeModules, Platform } from "react-native";

type CallSounds = {
  start(key: string, incoming: boolean, speaker: boolean): Promise<boolean>;
  stop(key: string): Promise<void>;
};
type BrowserCallSound = {
  context: AudioContext;
  timer: ReturnType<typeof setTimeout> | null;
  oscillators: Set<OscillatorNode>;
};

const native = NativeModules.CallSounds as CallSounds | undefined;
const browserSounds = new Map<string, BrowserCallSound>();
let browserAudioContext: AudioContext | null = null;

function getBrowserAudioContext() {
  const AudioContextConstructor = globalThis.AudioContext;
  if (!AudioContextConstructor)
    throw new Error("This browser does not support call audio.");
  return browserAudioContext ??= new AudioContextConstructor();
}

function unlockBrowserAudio() {
  try {
    const context = getBrowserAudioContext();
    void context.resume().catch(() => undefined);
    document.removeEventListener("pointerdown", unlockBrowserAudio, true);
    document.removeEventListener("keydown", unlockBrowserAudio, true);
  } catch (error) {
    console.warn("Unable to prepare browser call audio:", error);
  }
}

if (Platform.OS === "web" && typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlockBrowserAudio, true);
  document.addEventListener("keydown", unlockBrowserAudio, true);
}

function playBrowserTone(sound: BrowserCallSound, frequency: number, offset: number, duration: number) {
  const oscillator = sound.context.createOscillator();
  const gain = sound.context.createGain();
  const startsAt = sound.context.currentTime + offset;
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(0.07, startsAt + 0.035);
  gain.gain.setValueAtTime(0.07, startsAt + duration - 0.04);
  gain.gain.linearRampToValueAtTime(0, startsAt + duration);
  oscillator.connect(gain);
  gain.connect(sound.context.destination);
  sound.oscillators.add(oscillator);
  oscillator.onended = () => {
    sound.oscillators.delete(oscillator);
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration);
}

async function stopBrowserCallSound(key: string) {
  const sound = browserSounds.get(key);
  if (!sound) return;
  browserSounds.delete(key);
  if (sound.timer) clearTimeout(sound.timer);
  for (const oscillator of sound.oscillators) {
    try { oscillator.stop(); } catch { /* The scheduled tone already stopped. */ }
  }
  sound.oscillators.clear();
}

async function startBrowserCallSound(key: string, incoming: boolean) {
  await stopBrowserCallSound(key);
  const context = getBrowserAudioContext();
  const sound: BrowserCallSound = { context, timer: null, oscillators: new Set() };
  browserSounds.set(key, sound);
  try {
    await context.resume();
  } catch (error) {
    await stopBrowserCallSound(key);
    throw error;
  }
  if (browserSounds.get(key) !== sound) {
    await context.close().catch(() => undefined);
    return false;
  }

  const playCycle = () => {
    if (browserSounds.get(key) !== sound) return;
    if (incoming) {
      for (const frequency of [440, 480]) {
        playBrowserTone(sound, frequency, 0, 0.5);
        playBrowserTone(sound, frequency, 0.8, 0.5);
      }
      sound.timer = setTimeout(playCycle, 4500);
    } else {
      for (const frequency of [440, 480])
        playBrowserTone(sound, frequency, 0, 1.7);
      sound.timer = setTimeout(playCycle, 6000);
    }
  };
  playCycle();
  return true;
}

export async function startCallSound(key: string, incoming: boolean, speaker: boolean) {
  if (Platform.OS === "web") return startBrowserCallSound(key, incoming);
  if (Platform.OS !== "android" && Platform.OS !== "ios") return false;
  if (!native) throw new Error(`Install the latest ${Platform.OS} development build to enable ringing sounds.`);
  return native.start(key, incoming, speaker);
}

export async function stopCallSound(key: string) {
  if (Platform.OS === "web") return stopBrowserCallSound(key);
  await native?.stop(key);
}
