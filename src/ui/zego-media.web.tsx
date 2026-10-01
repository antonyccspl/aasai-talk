import { fetchZegoCallToken } from "@/data/zego";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ZegoExpressEngine } from "zego-express-engine-webrtc";

type Props = {
  sessionId: string;
  phone: string;
  video: boolean;
  muted: boolean;
  camera: boolean;
  front: boolean;
  speaker: boolean;
  videoPlaceholder?: React.ReactNode;
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
};

let webRtcLifecycle: Promise<void> = Promise.resolve();

export function ZegoMedia({
  sessionId,
  phone,
  video,
  muted,
  camera,
  front,
  videoPlaceholder,
  onStatus,
  onError,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const engineRef = useRef<ZegoExpressEngine | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamIdRef = useRef("");
  const roomIdRef = useRef("");
  const [remoteStream, setRemoteStream] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const controlsRef = useRef({ muted, camera, front });
  controlsRef.current = { muted, camera, front };
  const callbacksRef = useRef({ onStatus, onError });
  callbacksRef.current = { onStatus, onError };

  useEffect(() => {
    let disposed = false;
    let engine: ZegoExpressEngine | null = null;
    let localStream: MediaStream | null = null;
    let roomLoggedIn = false;
    let publishing = false;
    let playing = false;
    let localStreamId = "";

    const reportStatus = () => {
      if (!disposed)
        callbacksRef.current.onStatus?.(
          publishing && playing
            ? "Connected"
            : roomLoggedIn
              ? "Waiting for the other participant…"
              : "Connecting to call room…",
        );
    };

    const playRemoteStream = async (streamId: string) => {
      if (!engine || disposed || streamId === localStreamId) return;
      try {
        const stream = await engine.startPlayingStream(streamId);
        if (disposed) {
          engine.stopPlayingStream(streamId);
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        remoteStreamIdRef.current = streamId;
        const element = video ? remoteVideoRef.current : remoteAudioRef.current;
        if (!element) throw new Error("The remote media element is unavailable.");
        element.srcObject = stream;
        try {
          await element.play();
          setAudioPlaybackBlocked(false);
        } catch {
          setAudioPlaybackBlocked(true);
        }
        playing = true;
        setRemoteStream(true);
        reportStatus();
      } catch (error) {
        if (!disposed)
          callbacksRef.current.onError?.(
            error instanceof Error ? error.message : "Could not play the other participant's media.",
          );
      }
    };

    const start = async () => {
      try {
        callbacksRef.current.onStatus?.("Preparing microphone and camera…");
        const token = await fetchZegoCallToken(sessionId, phone);
        if (disposed) return;
        if (!token.webServerUrl)
          throw new Error("ZEGO WebRTC server URL is not configured for browser calls.");
        roomIdRef.current = token.roomId;

        engine = new ZegoExpressEngine(token.appId, token.webServerUrl, {
          scenario: 0,
        });
        engineRef.current = engine;
        localStreamId = `aasai_${token.userId}`;

        engine.on("roomStreamUpdate", (_roomId, updateType, streams) => {
          if (disposed) return;
          if (updateType === "ADD") {
            for (const stream of streams) void playRemoteStream(stream.streamID);
          } else {
            for (const stream of streams) {
              if (stream.streamID !== remoteStreamIdRef.current) continue;
              engine?.stopPlayingStream(stream.streamID);
              remoteStreamIdRef.current = "";
              playing = false;
              setRemoteStream(false);
              reportStatus();
            }
          }
        });

        roomLoggedIn = await engine.loginRoom(
          token.roomId,
          token.token,
          { userID: token.userId, userName: token.userId },
          { userUpdate: true },
        );
        if (!roomLoggedIn) throw new Error("ZEGO could not join the call room.");
        if (disposed) return;

        localStream = await engine.createStream({
          camera: {
            audio: true,
            video: video && controlsRef.current.camera,
            videoQuality: 2,
            facingMode: controlsRef.current.front ? "user" : "environment",
          },
        });
        localStreamRef.current = localStream;
        if (video && localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
          localVideoRef.current.muted = true;
          await localVideoRef.current.play().catch(() => undefined);
        }
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = !controlsRef.current.muted;
        });
        localStream.getVideoTracks().forEach((track) => {
          track.enabled = controlsRef.current.camera;
        });

        callbacksRef.current.onStatus?.("Starting microphone and speaker…");
        if (!engine.startPublishingStream(localStreamId, localStream))
          throw new Error("ZEGO could not start publishing your microphone.");
        publishing = true;
        reportStatus();
      } catch (error) {
        if (!disposed)
          callbacksRef.current.onError?.(
            error instanceof Error ? error.message : "Unable to start browser call media.",
          );
      }
    };

    webRtcLifecycle = webRtcLifecycle.then(start).catch((error) => {
      if (!disposed)
        callbacksRef.current.onError?.(
          error instanceof Error ? error.message : "Unable to start browser call media.",
        );
    });

    return () => {
      disposed = true;
      webRtcLifecycle = webRtcLifecycle.then(async () => {
        if (engine && localStreamId) engine.stopPublishingStream(localStreamId);
        if (engine && remoteStreamIdRef.current)
          engine.stopPlayingStream(remoteStreamIdRef.current);
        if (localStream) engine?.destroyStream(localStream);
        localStream?.getTracks().forEach((track) => track.stop());
        const remoteElement = video ? remoteVideoRef.current : remoteAudioRef.current;
        if (remoteElement) {
          const stream = remoteElement.srcObject;
          remoteElement.pause();
          remoteElement.srcObject = null;
          if (stream instanceof MediaStream)
            stream.getTracks().forEach((track) => track.stop());
        }
        if (roomLoggedIn) engine?.logoutRoom(roomIdRef.current);
        engine?.destroyEngine();
        if (engineRef.current === engine) engineRef.current = null;
        if (localStreamRef.current === localStream) localStreamRef.current = null;
        roomIdRef.current = "";
        remoteStreamIdRef.current = "";
        setRemoteStream(false);
      });
    };
  }, [sessionId, phone, video]);

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }, [muted]);

  useEffect(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = camera;
    });
  }, [camera]);

  useEffect(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track)
      void track.applyConstraints({
        facingMode: front ? "user" : "environment",
      }).catch(() => undefined);
  }, [front]);

  const enableRemoteAudio = () => {
    const element = video ? remoteVideoRef.current : remoteAudioRef.current;
    if (!element) return;
    element.muted = false;
    void element.play().then(() => setAudioPlaybackBlocked(false)).catch(() => {
      callbacksRef.current.onError?.("Browser blocked call audio. Check site sound permissions and try again.");
    });
  };

  return (
    <View style={{ width: "100%", height: "100%", minHeight: 220, position: "relative", alignItems: "center", justifyContent: "center", backgroundColor: "#14201c", overflow: "hidden" }}>
      {video ? (
        <>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ position: "absolute", top: 12, right: 12, width: 96, height: 128, objectFit: "cover", borderRadius: 14, backgroundColor: "#26352f" }}
          />
        </>
      ) : (
        <>
          <audio ref={remoteAudioRef} autoPlay />
          <View style={{ width: 76, height: 76, borderRadius: 40, backgroundColor: "#26352f", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: 28 }}>♪</Text>
          </View>
        </>
      )}
      {!remoteStream && videoPlaceholder ? (
        <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#14201c" }}>
          {videoPlaceholder}
        </View>
      ) : null}
      {audioPlaybackBlocked ? (
        <Pressable accessibilityRole="button" onPress={enableRemoteAudio} style={{ position: "absolute", bottom: 12, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, backgroundColor: "#fff" }}>
          <Text style={{ color: "#14201c", fontWeight: "600" }}>Tap to enable call audio</Text>
        </Pressable>
      ) : null}
    </View>
  );
}