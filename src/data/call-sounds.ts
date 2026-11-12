import { NativeModules, Platform } from "react-native";

type CallSounds = {
  start(key: string, incoming: boolean, speaker: boolean): Promise<boolean>;
  stop(key: string): Promise<void>;
};
type BrowserCallSound = {
  context: AudioContext;
  timer: ReturnType<typeof setTimeout> | null;
  oscillators: Set<OscillatorNode>;
  ringtone?: AudioBufferSourceNode;
};

const native = NativeModules.CallSounds as CallSounds | undefined;
const browserSounds = new Map<string, BrowserCallSound>();
let browserAudioContext: AudioContext | null = null;
const audioReadyListeners = new Set<() => void>();
export function onCallAudioReady(listener: () => void) {
  audioReadyListeners.add(listener);
  return () => { audioReadyListeners.delete(listener); };
}
export function prepareCallAudio() {
  if (Platform.OS === "web") unlockBrowserAudio();
}

function getBrowserAudioContext() {
  const AudioContextConstructor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor)
    throw new Error("This browser does not support call audio.");
  if (!browserAudioContext || browserAudioContext.state === "closed") {
    browserAudioContext = new AudioContextConstructor();
    browserAudioContext.onstatechange = () => {
      if (browserAudioContext?.state === "running") audioReadyListeners.forEach(listener => listener());
    };
  }
  return browserAudioContext;
}

function unlockBrowserAudio() {
  try {
    const context = getBrowserAudioContext();
    void context.resume().catch(() => undefined);
    // Keep the gesture listeners: mobile browsers may suspend audio again.
  } catch (error) {
    console.warn("Unable to prepare browser call audio:", error);
  }
}

if (Platform.OS === "web" && typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlockBrowserAudio, true);
  document.addEventListener("pointerup", unlockBrowserAudio, true);
  document.addEventListener("click", unlockBrowserAudio, true);
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
  if (sound.ringtone) {
    try { sound.ringtone.stop(); } catch { /* Already stopped. */ }
    sound.ringtone.disconnect();
  }
  for (const oscillator of sound.oscillators) {
    try { oscillator.stop(); } catch { /* The scheduled tone already stopped. */ }
  }
  sound.oscillators.clear();
}

async function startBrowserCallSound(key: string, incoming: boolean) {
  const context = getBrowserAudioContext();
  const existing = browserSounds.get(key);
  const sound: BrowserCallSound = existing ?? { context, timer: null, oscillators: new Set() };
  browserSounds.set(key, sound);
  // Queue once, including while suspended: the next gesture resumes this call.
  if (!existing) {
    if (incoming) {
      // Loop in the audio engine rather than relying on throttled browser timers.
      const rate = context.sampleRate;
      const buffer = context.createBuffer(1, Math.ceil(rate * 3.2), rate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const time = i / rate;
        for (const [start, frequency] of [[0, 660], [0.24, 880], [0.62, 660], [0.86, 880]]) {
          const t = time - start;
          if (t >= 0 && t < 0.22) {
            const envelope = Math.min(1, t / 0.012, (0.22 - t) / 0.04);
            samples[i] = 0.28 * envelope * (Math.sin(2 * Math.PI * frequency * t) + 0.25 * Math.sin(4 * Math.PI * frequency * t));
          }
        }
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(context.destination);
      sound.ringtone = source;
      source.start();
    } else {
  
    const playCycle = () => {
      if (browserSounds.get(key) !== sound) return;
      for (const frequency of [440, 480])
        playBrowserTone(sound, frequency, 0, 1.7);
      sound.timer = setTimeout(playCycle, 6000);
    };
    playCycle();
    }
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([context.resume(), new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Tap Play ringtone to turn on call sound. You can still answer this call.")), 2000);
    })]);
    if (browserSounds.get(key) !== sound) return false;
    if (context.state !== "running") throw new Error("Tap Play ringtone to turn on call sound. You can still answer this call.");
    return true;
  } catch (error) {
    if (browserSounds.get(key) !== sound) return false;
    // Keep the queued sound so a later user gesture can recover it.
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

/**
 * A browser call can be replaced by another route before its component has
 * finished unmounting. Clear every browser tone so an old ring cannot survive
 * an accepted or ended call.
 */
export async function stopAllCallSounds() {
  if (Platform.OS !== "web") return;
  await Promise.all([...browserSounds.keys()].map((key) => stopBrowserCallSound(key)));
}
