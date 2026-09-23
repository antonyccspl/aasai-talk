import React, { useEffect, useRef, useState } from "react";
import {
  findNodeHandle,
  Platform,
  PermissionsAndroid,
  StyleSheet,
  View,
  type View as ViewType,
} from "react-native";
import type ZegoExpressEngine from "zego-express-engine-reactnative/lib/ZegoExpressEngine";
import type {
  ZegoPublishChannel,
  ZegoView,
} from "zego-express-engine-reactnative/lib/ZegoExpressDefines";
import { fetchZegoCallToken } from "@/data/zego";

type Props = {
  sessionId: string;
  phone: string;
  video: boolean;
  muted: boolean;
  camera: boolean;
  front: boolean;
  speaker: boolean;
  /** Shown only until the other participant's video stream arrives. */
  videoPlaceholder?: React.ReactNode;
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
};

type ZegoModule = typeof import("zego-express-engine-reactnative");
// Zego is a process-wide singleton. Finish the previous room's cleanup before
// another screen creates it, including React development remounts.
let rtcLifecycle: Promise<void> = Promise.resolve();

function getZegoModule(): ZegoModule | null {
  if (Platform.OS === "web") return null;
  return require("zego-express-engine-reactnative") as ZegoModule;
}

export function ZegoMedia({
  sessionId,
  phone,
  video,
  muted,
  camera,
  front,
  speaker,
  videoPlaceholder,
  onStatus,
  onError,
}: Props) {
  const localRef = useRef<ViewType>(null);
  const remoteRef = useRef<ViewType>(null);
  const engineRef = useRef<ZegoExpressEngine | null>(null);
  const roomRef = useRef("");
  const publishedRef = useRef(false);
  const remoteStreamRef = useRef("");
  const [remoteStream, setRemoteStream] = useState(false);
  const [textureView, setTextureView] = useState<React.ComponentType | null>(null);
  const callbacks = useRef({ onStatus, onError });
  callbacks.current = { onStatus, onError };
  const controls = useRef({ muted, camera, front, speaker });
  controls.current = { muted, camera, front, speaker };

  useEffect(() => {
    let disposed = false;
    let engine: ZegoExpressEngine | null = null;
    const onStatus = (value: string) => { if (!disposed) callbacks.current.onStatus?.(value); };
    const onError = (value: string) => {
      if (!disposed) {
        console.error("[RTC] media failure", value);
        callbacks.current.onError?.(value);
      }
    };
    const zego = getZegoModule();
    if (!zego) {
      onStatus?.("Native RTC is available in a development build.");
      return;
    }
    setTextureView(() => zego.ZegoTextureView);

    const start = async () => {
      try {
        if (disposed) return;
        if (Platform.OS === "android") {
          const required = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
          if (video) required.push(PermissionsAndroid.PERMISSIONS.CAMERA);
          const granted = await PermissionsAndroid.requestMultiple(required);
          if (required.some((permission) => granted[permission] !== PermissionsAndroid.RESULTS.GRANTED))
            throw new Error(video ? "Allow microphone and camera access to join this call." : "Allow microphone access to join this call.");
          if (disposed) return;
        }
        onStatus?.(video ? "Preparing microphone and camera…" : "Preparing microphone and speaker…");
        const auth = await fetchZegoCallToken(sessionId, phone);
        if (disposed) return;
        onStatus?.("Joining secure media room…");
        const profile = new zego.ZegoEngineProfile(
          auth.appId,
          "",
          video
            ? zego.ZegoScenario.StandardVideoCall
            : zego.ZegoScenario.StandardVoiceCall,
        );
        engine = await zego.default.createEngineWithProfile(profile);
        if (disposed) return;
        engineRef.current = engine;
        const activeEngine = engine;
        let publishing = false;
        let playing = false;
        const reportConnection = () => onStatus(publishing && playing ? "Connected" : "Waiting for two-way media…");
        activeEngine.on("publisherStateUpdate", (_stream, state, errorCode) => {
          if (disposed) return;
          console.info("[RTC] publisher state", state, "code", errorCode);
          publishing = state === zego.ZegoPublisherState.Publishing;
          if (errorCode && state === zego.ZegoPublisherState.NoPublish)
            onError(`Microphone publishing failed (${errorCode}).`);
          else reportConnection();
        });
        activeEngine.on("playerStateUpdate", (_stream, state, errorCode) => {
          if (disposed) return;
          console.info("[RTC] playback state", state, "code", errorCode);
          playing = state === zego.ZegoPlayerState.Playing;
          if (errorCode && state === zego.ZegoPlayerState.NoPlay)
            onError(`Incoming audio playback failed (${errorCode}).`);
          else reportConnection();
        });
        if (__DEV__) {
          let localLogAt = 0;
          let remoteLogAt = 0;
          activeEngine.on("capturedSoundLevelUpdate", level => {
            if (!disposed && Date.now() - localLogAt > 5000) {
              localLogAt = Date.now(); console.info("[RTC] microphone level", Math.round(level));
            }
          });
          activeEngine.on("remoteSoundLevelUpdate", levels => {
            if (!disposed && Date.now() - remoteLogAt > 5000) {
              remoteLogAt = Date.now(); console.info("[RTC] received audio level", Math.round(Math.max(0, ...Object.values(levels))));
            }
          });
          await activeEngine.startSoundLevelMonitor(undefined);
        }
        const audioSourceResult = await activeEngine.setAudioSource(zego.ZegoAudioSourceType.Microphone, undefined);
        if (audioSourceResult !== 0) throw new Error(`Microphone source setup failed (${audioSourceResult}).`);
        await activeEngine.enableAudioCaptureDevice(true);
        await activeEngine.muteMicrophone(controls.current.muted);
        await activeEngine.muteSpeaker(false);
        await activeEngine.setCaptureVolume(100);
        await activeEngine.setAudioRouteToSpeaker(controls.current.speaker);
        await activeEngine.mutePublishStreamAudio(controls.current.muted, undefined);
        await activeEngine.enableCamera(video && controls.current.camera, undefined);
        if (video) await activeEngine.useFrontCamera(controls.current.front, undefined);
        if (disposed) return;
        roomRef.current = auth.roomId;
        activeEngine.on("roomStreamUpdate", async (_room, updateType, streams) => {
          if (disposed) return;
          try {
          if (updateType === zego.ZegoUpdateType.Add) {
            for (const stream of streams) {
              if (!stream?.streamID || stream.streamID === `aasai_${auth.userId}`) continue;
              const tag = findNodeHandle(remoteRef.current);
              const view: ZegoView | undefined =
                video && tag
                  ? new zego.ZegoView(tag, zego.ZegoViewMode.AspectFill, 0)
                  : undefined;
              await activeEngine.startPlayingStream(stream.streamID, view, undefined);
              await activeEngine.mutePlayStreamAudio(stream.streamID, false);
              await activeEngine.setPlayVolume(stream.streamID, 100);
              if (disposed) return;
              remoteStreamRef.current = stream.streamID;
              setRemoteStream(true);
            }
          } else {
            for (const stream of streams) {
              if (stream?.streamID !== remoteStreamRef.current) continue;
              await activeEngine.stopPlayingStream(stream.streamID);
              remoteStreamRef.current = "";
              setRemoteStream(false);
            }
          }
          } catch (error) { onError(error instanceof Error ? error.message : "Unable to play remote media."); }
        });
        activeEngine.on("roomStateChanged", (_room, reason, errorCode) => {
          if (reason === zego.ZegoRoomStateChangedReason.Logined)
            onStatus?.("Waiting for the other participant…");
          if (reason === zego.ZegoRoomStateChangedReason.Reconnecting)
            onStatus?.("Reconnecting");
          if (reason === zego.ZegoRoomStateChangedReason.LoginFailed)
            onError?.(`Media room could not connect (${errorCode}).`);
        });
        const user = new zego.ZegoUser(auth.userId, auth.userId);
        const config = new zego.ZegoRoomConfig(2, true, auth.token);
        const login = await activeEngine.loginRoom(auth.roomId, user, config);
        if (disposed) return;
        if (login.errorCode) {
          onError?.(`Media room login failed (${login.errorCode}).`);
          return;
        }
        onStatus?.("Starting microphone and speaker…");
        const channel: ZegoPublishChannel | undefined = undefined;
        if (video) {
          const tag = findNodeHandle(localRef.current);
          if (tag) {
            const view = new zego.ZegoView(tag, zego.ZegoViewMode.AspectFill, 0);
            await activeEngine.startPreview(view, channel);
          }
        }
        await activeEngine.startPublishingStream(`aasai_${auth.userId}`, channel, undefined);
        publishedRef.current = true;
        reportConnection();
      } catch (error) {
        if (!disposed)
          onError?.(error instanceof Error ? error.message : "Unable to start media.");
      }
    };
    rtcLifecycle = rtcLifecycle.then(start).catch(error => onError(String(error)));
    return () => {
      disposed = true;
      const cleanup = async () => {
        if (!engine) return;
        try {
          if (remoteStreamRef.current)
            await engine.stopPlayingStream(remoteStreamRef.current);
          if (publishedRef.current) await engine.stopPublishingStream(undefined);
          if (roomRef.current) await engine.logoutRoom(roomRef.current);
          await zego.default.destroyEngine();
        } catch (error) {
          console.warn("Failed to clean up ZEGOCLOUD media:", error);
        } finally {
          engineRef.current = null;
          publishedRef.current = false;
          remoteStreamRef.current = "";
        }
      };
      rtcLifecycle = rtcLifecycle.then(cleanup);
    };
  }, [sessionId, phone, video]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) void engine.setAudioRouteToSpeaker(speaker);
  }, [speaker]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) {
      void engine.muteMicrophone(muted);
      void engine.mutePublishStreamAudio(muted, undefined);
    }
  }, [muted]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine && video) void engine.enableCamera(camera, undefined);
  }, [camera, video]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine && video) void engine.useFrontCamera(front, undefined);
  }, [front, video]);

  if (Platform.OS === "web") return null;
  // RCTZegoTextureView is a native view and cannot safely receive border/radius
  // properties with Fabric. Keep the visual frame on a normal RN View instead.
  const localVideo = (
    <View style={styles.localFrame} pointerEvents="none">
      {textureView
        ? React.createElement(textureView, {
            ref: localRef,
            style: styles.localTexture,
          } as never)
        : <View ref={localRef} style={styles.localTexture} />}
    </View>
  );
  const remoteVideo = textureView
    ? React.createElement(textureView, {
        ref: remoteRef,
        style: styles.remote,
      } as never)
    : <View ref={remoteRef} style={styles.remote} />;
  return (
    <View style={styles.media}>
      {video && remoteVideo}
      {!remoteStream && video && (
        <View style={styles.remotePlaceholder}>{videoPlaceholder}</View>
      )}
      {video && localVideo}
      {!video && <View style={styles.audioIndicator} />}
    </View>
  );
}

const styles = StyleSheet.create({
  media: { ...StyleSheet.absoluteFill },
  localFrame: {
    position: "absolute", top: 14, right: 14, width: 94, height: 132, zIndex: 2,
    borderRadius: 16, borderWidth: 2, borderColor: "rgba(255,255,255,0.82)", overflow: "hidden",
    backgroundColor: "#111714",
  },
  localTexture: { width: "100%", height: "100%" },
  remote: { ...StyleSheet.absoluteFill, zIndex: 0 },
  remotePlaceholder: {
    ...StyleSheet.absoluteFill, zIndex: 1, backgroundColor: "#14201c",
    alignItems: "center", justifyContent: "center",
  },
  audioIndicator: { width: 1, height: 1 },
});
