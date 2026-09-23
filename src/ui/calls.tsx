import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, Vibration, View } from "react-native";
import { router } from "expo-router";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chips,
  Empty,
  go,
  Icon,
  IconButton,
  Notice,
  Row,
  Section,
  Setting,
  Shell,
  T,
  Wave,
} from "./components";
import { coins, duration, people, personFor, talkTime, useDemo } from "./store";
import { colors as c } from "./theme";
import {
  startPhoneCall,
  fetchPhoneCallSummary,
  fetchPhoneHostCallCapabilities,
  acceptPhoneCallVideoUpgrade,
  requestPhoneCallVideoUpgrade,
  updatePhoneCall,
  settlePhoneCall,
  subscribeToPhoneCall,
} from "@/data/call-sessions";
import { useAuth } from "@/data/auth";
import { ZegoMedia } from "./zego-media";
import { startCallSound, stopCallSound } from "@/data/call-sounds";
import { fetchHostCurrentSlabs } from "@/data/host-metrics";

export function CallScreen({
  mode,
  id,
  type = "audio",
  sessionId = "",
}: {
  mode: string;
  id: string;
  type?: string;
  sessionId?: string;
}) {
  const d = useDemo();
  const auth = useAuth();
  const p = people.find((person) => person.id === id) ?? {
    id,
    name: "Caller",
    status: "Available" as const,
    photo: undefined,
    color: c.mint,
    age: 0,
    gender: "",
    city: "",
    languages: [],
    interests: [],
    bio: "",
  };
  const requestedVideo = mode === "video" || type === "video";
  const activeForThisCall =
    d.active?.person === id && (!sessionId || d.active.id === sessionId);
  const video = activeForThisCall ? d.active?.type === "video" : requestedVideo;
  const incoming = mode === "incoming";
  const availableSeconds = d.active?.availableSeconds;
  const remainingTalkSeconds = Math.max(
    0,
    (availableSeconds ?? 0) - (d.active?.seconds ?? 0),
  );
  const connectedRoute = (mode === "audio" || mode === "video") && !!sessionId;
  const outgoing =
    mode === "outgoing" ||
    ((mode === "audio" || mode === "video") && !connectedRoute);
  const [state, setState] = useState(
    incoming ? "Incoming" : outgoing ? "Ringing" : "Connected",
  );
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(true);
  const [front, setFront] = useState(true);
  const [route, setRoute] = useState(
    d.active?.speaker === undefined
      ? "Speaker"
      : d.active.speaker
        ? "Speaker"
        : "Earpiece",
  );
  const soundKey = useRef(`call-sound-${Date.now()}-${Math.random()}`).current;
  const [soundError, setSoundError] = useState("");
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [callError, setCallError] = useState("");
  const [mediaStatus, setMediaStatus] = useState("Starting media…");
  const connectingRef = useRef(false);
  const actionRef = useRef(false);
  const closedRef = useRef(false);
  const [actionPending, setActionPending] = useState(false);
  const [hostCapabilities, setHostCapabilities] = useState<{
    audio: boolean;
    video: boolean;
  } | null>(null);
  const blocked = d.blocked.includes(id);
  const conflict = !!d.active && d.active.person !== id;
  const activeCallId = d.active?.id ?? "";
  const mediaSessionId = /^[0-9a-f-]{36}$/.test(activeCallId)
    ? activeCallId
    : "";
  const activePhone = auth.demoPhone;
  const setActiveCall = d.setActive;
  const incomingCall = d.active?.incoming;
  const hostPhone = d.active?.incoming
    ? auth.demoPhone
    : id.startsWith("phone_")
      ? `+${id.slice("phone_".length)}`
      : "";
  const canSwitchToVideo =
    !video &&
    d.active?.status === "Connected" &&
    hostCapabilities?.video === true &&
    !d.active?.videoUpgradeRequestedBy;
  const videoRequestFromMe =
    !!d.active?.videoUpgradeRequestedBy &&
    d.active.videoUpgradeRequestedBy === auth.demoPhone;
  const videoRequestForMe =
    !!d.active?.videoUpgradeRequestedBy && !videoRequestFromMe;
  const onMediaStatus = useCallback(
    (status: string) => setMediaStatus(status),
    [],
  );
  const onMediaError = useCallback(
    (message: string) => {
      setCallError(message);
      setMediaStatus("Media unavailable");
      if (mediaSessionId && activePhone) {
        void updatePhoneCall(mediaSessionId, activePhone, "ended")
          .then(() =>
            incomingCall
              ? undefined
              : settlePhoneCall(mediaSessionId, activePhone),
          )
          .catch((error) =>
            console.error("Failed to close unavailable media call:", error),
          );
      }
      setActiveCall((current) => {
        if (!current || current.id !== mediaSessionId) return current;
        return null;
      });
    },
    [activePhone, setActiveCall, incomingCall, mediaSessionId],
  );
  useEffect(() => {
    if (!hostPhone) return;
    let mounted = true;
    void fetchPhoneHostCallCapabilities(hostPhone)
      .then((value) => {
        if (mounted) setHostCapabilities(value);
      })
      .catch((error) =>
        console.warn("Failed to load Host call capabilities:", error),
      );
    return () => {
      mounted = false;
    };
  }, [hostPhone]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (value) =>
      setForeground(value === "active"),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const shouldRing =
      foreground &&
      !actionPending &&
      !closedRef.current &&
      !callError &&
      (incoming ? !!sessionId : outgoing && d.active?.status === "Ringing");
    let disposed = false;
    if (shouldRing) {
      setSoundError("");
      void startCallSound(soundKey, incoming, route === "Speaker").catch(
        (error) => {
          if (!disposed)
            setSoundError(
              error instanceof Error
                ? error.message
                : "Call sound is unavailable.",
            );
        },
      );
    } else void stopCallSound(soundKey);
    return () => {
      disposed = true;
      void stopCallSound(soundKey);
    };
  }, [
    foreground,
    incoming,
    outgoing,
    sessionId,
    d.active?.status,
    actionPending,
    callError,
    route,
    soundKey,
  ]);
  useEffect(() => {
    setState(incoming ? "Incoming" : outgoing ? "Ringing" : "Connected");
  }, [incoming, outgoing, sessionId]);
  useEffect(() => {
    if (
      mode !== "incoming" ||
      state !== "Incoming" ||
      actionPending ||
      !foreground
    )
      return;
    Vibration.vibrate([0, 700, 500], true);
    return () => {
      Vibration.cancel();
    };
  }, [mode, state, actionPending, foreground]);
  useEffect(() => {
    if (d.active?.person === id && !incoming)
      d.setActive((x) => (x ? { ...x, status: state } : x));
  }, [state, incoming, d.active?.person, id]);
  async function end(status = "Ended") {
    if (closedRef.current) return;
    closedRef.current = true;
    Vibration.cancel();
    await stopCallSound(soundKey);
    setActionPending(true);
    const activeSessionId =
      sessionId ||
      (d.active && /^[0-9a-f-]{36}$/.test(d.active.id) ? d.active.id : "");
    let settledCharge: number | undefined;
    if (auth.demoPhone && activeSessionId) {
      try {
        await updatePhoneCall(
          activeSessionId,
          auth.demoPhone,
          status === "Ended"
            ? "ended"
            : status === "Rejected"
              ? "rejected"
              : status === "Missed"
                ? "missed"
                : "cancelled",
          d.active?.seconds ?? 0,
        );
        if (!incoming && !d.active?.incoming) {
          const settlement = await settlePhoneCall(
            activeSessionId,
            auth.demoPhone,
          );
          const summary = await fetchPhoneCallSummary(
            activeSessionId,
            auth.demoPhone,
          );
          settledCharge = summary.coins_charged;
          await d
            .refreshWalletBalance()
            .catch((error) =>
              console.error(
                "Failed to refresh the settled wallet balance:",
                error,
              ),
            );
        }
      } catch (error) {
        console.error("Failed to close and settle call:", error);
      }
    }
    if (d.active) d.finishCall(status, settledCharge);
    else
      d.setCalls((v) => [
        {
          id: `demo-${Date.now()}`,
          person: id,
          type: video ? "video" : "audio",
          status,
          seconds: 0,
          incoming,
        },
        ...v,
      ]);
    router.replace(`/calls/result/${id}?status=${status}` as never);
  }
  async function switchToVideo() {
    const requesterPhone = auth.demoPhone;
    if (
      !canSwitchToVideo ||
      !mediaSessionId ||
      !requesterPhone ||
      actionPending
    )
      return;
    setActionPending(true);
    setCallError("");
    setMediaStatus("Video request sent");
    try {
      await requestPhoneCallVideoUpgrade(mediaSessionId, requesterPhone);
      d.setActive((current) => {
        if (!current || current.id !== mediaSessionId) return current;
        return { ...current, videoUpgradeRequestedBy: requesterPhone };
      });
    } catch (error) {
      setCallError(
        error instanceof Error
          ? error.message
          : "Unable to switch this call to video.",
      );
      setMediaStatus("Connected");
    } finally {
      setActionPending(false);
    }
  }
  async function acceptVideoUpgrade() {
    if (
      !videoRequestForMe ||
      !mediaSessionId ||
      !auth.demoPhone ||
      actionPending
    )
      return;
    setActionPending(true);
    setCallError("");
    setMediaStatus("Starting video…");
    try {
      const result = await acceptPhoneCallVideoUpgrade(
        mediaSessionId,
        auth.demoPhone,
      );
      d.setActive((current) => {
        if (!current || current.id !== mediaSessionId) return current;
        if (current.incoming) return { ...current, type: result.callType };
        const remainingCoins = result.remainingCoins ?? d.balance;
        const remainder = 60 - (current.seconds % 60);
        return {
          ...current,
          type: result.callType,
          availableSeconds:
            current.seconds +
            remainder +
            Math.floor(remainingCoins / result.coinsPerMinute) * 60,
        };
      });
      if (!d.active?.incoming && typeof result.remainingCoins === "number")
        d.setBalance(result.remainingCoins);
      router.replace(
        `/calls/video/${id}?session=${mediaSessionId}&type=video` as never,
      );
    } catch (error) {
      setCallError(
        error instanceof Error
          ? error.message
          : "Unable to accept the video request.",
      );
      setMediaStatus("Connected");
    } finally {
      setActionPending(false);
    }
  }
  async function connect() {
    if (blocked || conflict || actionRef.current || closedRef.current) return;
    setCallError("");
    if (d.active && !incoming) return;
    if (!auth.demoPhone || !id.startsWith("phone_"))
      return go("/status/unavailable");
    const hostPhone = `+${id.slice("phone_".length)}`;
    let session;
    let callCoinsPerMinute: number | undefined;
    actionRef.current = true;
    setActionPending(true);
    try {
      if (!incoming && d.paid) {
        const hostSlabs = await fetchHostCurrentSlabs(hostPhone);
        const slab = hostSlabs.find(
          (row) => row.call_type === (video ? "VIDEO" : "AUDIO"),
        );
        callCoinsPerMinute = slab
          ? Math.ceil(slab.diamonds_per_minute * slab.coins_per_diamond)
          : undefined;
        if (!callCoinsPerMinute || d.balance < callCoinsPerMinute) {
          go("/wallet/low-balance");
          return;
        }
      }
      if (incoming && sessionId) {
        await stopCallSound(soundKey);
        await updatePhoneCall(sessionId, auth.demoPhone, "connected");
        session = {
          id: sessionId,
          roomId: "",
          status: "connected" as const,
          callType: video ? ("video" as const) : ("audio" as const),
        };
      } else {
        session = await startPhoneCall(
          auth.demoPhone,
          hostPhone,
          video ? "video" : "audio",
        );
      }
    } catch (error) {
      console.error("Failed to start call session:", error);
      setCallError(
        error instanceof Error && error.message
          ? error.message
          : "We could not start this call. Please try again.",
      );
      return;
    } finally {
      actionRef.current = false;
      setActionPending(false);
    }
    if (closedRef.current) {
      // Cancel may have been pressed while session creation was in flight.
      await updatePhoneCall(session.id, auth.demoPhone, "cancelled").catch(
        console.warn,
      );
      return;
    }
    Vibration.cancel();
    d.setActive({
      id: session.id,
      person: id,
      type: video ? "video" : "audio",
      status: incoming ? "Connected" : "Ringing",
      seconds: 0,
      incoming,
      speaker: route === "Speaker",
      availableSeconds:
        !incoming && callCoinsPerMinute
          ? Math.floor(d.balance / callCoinsPerMinute) * 60
          : undefined,
    });
    if (incoming || session.status === "connected")
      router.replace(
        `/calls/${video ? "video" : "audio"}/${id}?session=${session.id}&type=${video ? "video" : "audio"}` as never,
      );
  }
  useEffect(() => {
    if (!outgoing || sessionId || connectingRef.current) return;
    connectingRef.current = true;
    void connect().finally(() => {
      connectingRef.current = false;
    });
  }, [outgoing, sessionId, id, type]);
  useEffect(() => {
    const activeId =
      sessionId ||
      (d.active && /^[0-9a-f-]{36}$/.test(d.active.id) ? d.active.id : "");
    if (!activeId || !auth.demoPhone) return;
    return subscribeToPhoneCall(activeId, auth.demoPhone, async (status) => {
      if (status === "connected" && outgoing) {
        await stopCallSound(soundKey);
        if (closedRef.current) return;
        d.setActive((current) =>
          current ? { ...current, status: "Connected" } : current,
        );
        router.replace(
          `/calls/${video ? "video" : "audio"}/${id}?session=${activeId}&type=${video ? "video" : "audio"}` as never,
        );
      } else if (status !== "ringing" && status !== "connected") {
        if (closedRef.current) return;
        closedRef.current = true;
        Vibration.cancel();
        void stopCallSound(soundKey);
        setCallError(`Call ${status}.`);
        d.finishCall(status);
        router.replace(`/calls/result/${id}?status=${status}` as never);
      }
    });
  }, [outgoing, sessionId, d.active?.id, id, video, auth.demoPhone]);
  const ringing = outgoing || incoming;
  if (!ringing && (blocked || conflict))
    return (
      <Shell title="Call unavailable">
        <Notice error>
          {blocked
            ? "Unblock this person before starting a call."
            : "Another call is already active."}
        </Notice>
        <Button title="Back to Explore" onPress={() => go("/explore")} />
      </Shell>
    );
  return (
    <Shell
      title={incoming ? "Incoming call" : video ? "Video call" : "Audio call"}
      immersive
      skipSkeleton
      footer={
        ringing ? (
          incoming ? (
            <Row>
              <Button
                title="Decline"
                icon="phone-off"
                variant="danger"
                disabled={actionPending}
                style={{ flex: 1 }}
                onPress={() => end("Rejected")}
              />
              <Button
                title={actionPending ? "Connecting…" : "Accept"}
                icon={video ? "video" : "phone"}
                disabled={
                  blocked || conflict || actionPending || closedRef.current
                }
                style={{ flex: 1 }}
                onPress={connect}
              />
            </Row>
          ) : (
            <View style={{ gap: 10 }}>
              <Button
                title={route === "Speaker" ? "Speaker on" : "Speaker off"}
                icon={route === "Speaker" ? "volume-2" : "headphones"}
                variant="secondary"
                onPress={() => {
                  const next = route !== "Speaker";
                  setRoute(next ? "Speaker" : "Earpiece");
                  d.setActive((current) =>
                    current ? { ...current, speaker: next } : current,
                  );
                }}
              />
              {callError && !d.active && (
                <Button
                  title="Try again"
                  disabled={actionPending}
                  onPress={connect}
                />
              )}
              <Button
                title="Cancel call"
                icon="phone-off"
                variant="danger"
                onPress={() => end("Cancelled")}
              />
            </View>
          )
        ) : (
          <View style={{ gap: 10 }}>
            <Row
              style={{
                backgroundColor: c.surface,
                borderColor: c.line,
                borderWidth: 1,
                borderRadius: 28,
                padding: 10,
                justifyContent: "space-around",
              }}
            >
              <IconButton
                label={muted ? "Unmute microphone" : "Mute microphone"}
                icon={muted ? "mic-off" : "mic"}
                active={!muted}
                onPress={() => setMuted(!muted)}
              />
              <IconButton
                label="Change audio route"
                icon={route === "Speaker" ? "volume-2" : "headphones"}
                onPress={() =>
                  setRoute(route === "Speaker" ? "Earpiece" : "Speaker")
                }
              />
              <IconButton
                label={
                  video
                    ? "Toggle camera"
                    : canSwitchToVideo
                      ? "Switch to video"
                      : "Open chat"
                }
                icon={
                  video
                    ? camera
                      ? "video"
                      : "video-off"
                    : canSwitchToVideo
                      ? "video"
                      : "message-circle"
                }
                onPress={() =>
                  video
                    ? setCamera(!camera)
                    : canSwitchToVideo
                      ? switchToVideo()
                      : go(`/chat/${id}`)
                }
              />
              <IconButton
                label="End call"
                icon="phone-off"
                danger
                onPress={() => end()}
              />
            </Row>
            <Row style={{ justifyContent: "space-around" }}>
              <T size={11}>Microphone</T>
              <T size={11}>{route}</T>
              <T size={11}>
                {video ? "Camera" : canSwitchToVideo ? "Video" : "Chat"}
              </T>
              <T size={11} color={c.error}>
                End
              </T>
            </Row>
          </View>
        )
      }
    >
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ gap: 4 }}>
          <T mono size={11} color={c.mint} bold>
            {video ? "VIDEO CONNECTION" : "AUDIO CONNECTION"}
          </T>
          <T size={13} color={c.secondary}>
            {ringing ? "Waiting for response" : "Private 1:1 conversation"}
          </T>
        </View>
        <Badge
          text={
            ringing
              ? state
              : d.active?.incoming
                ? duration(d.active?.seconds ?? 0)
                : talkTime(remainingTalkSeconds)
          }
          warning={state !== "Connected" && !ringing}
        />
      </Row>
      {!ringing && !video && videoRequestFromMe && (
        <Notice>
          Video request sent. Waiting for the other participant to accept.
        </Notice>
      )}
      {!ringing && !video && videoRequestForMe && (
        <Card style={{ gap: 10 }}>
          <T bold>Switch this call to video?</T>
          <T size={12} color={c.secondary}>
            The next billed minute will use the Host’s video-call rate.
          </T>
          <Button
            title={actionPending ? "Accepting video…" : "Accept video"}
            icon="video"
            disabled={actionPending}
            onPress={acceptVideoUpgrade}
          />
        </Card>
      )}
      {video && !ringing ? (
        <Card
          style={{
            height: 454,
            backgroundColor: "#14201c",
            borderColor: c.line,
            borderWidth: 1,
            overflow: "hidden",
            padding: 0,
            borderRadius: 26,
          }}
        >
          {!ringing && mediaSessionId && auth.demoPhone && (
            <ZegoMedia
              sessionId={mediaSessionId}
              phone={auth.demoPhone}
              video
              muted={muted}
              camera={camera}
              front={front}
              speaker={route === "Speaker"}
              onStatus={onMediaStatus}
              onError={onMediaError}
              videoPlaceholder={
                <View
                  style={{
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 30,
                  }}
                >
                  <View
                    style={{
                      padding: 8,
                      borderRadius: 99,
                      backgroundColor: c.successSurface,
                    }}
                  >
                    <Avatar person={p} size={86} />
                  </View>
                  <T bold size={21}>
                    {p.name}
                  </T>
                  <T
                    size={13}
                    color={c.secondary}
                    style={{ textAlign: "center" }}
                  >
                    {camera ? "Waiting for their video…" : "Your camera is off"}
                  </T>
                </View>
              }
            />
          )}
          <View
            style={{
              position: "absolute",
              zIndex: 3,
              top: 16,
              left: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                backgroundColor: "rgba(8,13,11,0.74)",
                borderRadius: 99,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Row style={{ gap: 6 }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    backgroundColor: c.mint,
                  }}
                />
                <T mono size={10} color={c.mint} bold>
                  LIVE
                </T>
              </Row>
            </View>
            <View
              style={{
                backgroundColor: "rgba(8,13,11,0.74)",
                borderRadius: 99,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <T mono size={10} color={c.text}>
                {d.active?.incoming
                  ? duration(d.active?.seconds ?? 0)
                  : talkTime(remainingTalkSeconds)}
              </T>
            </View>
          </View>
          <View
            style={{
              position: "absolute",
              zIndex: 3,
              left: 16,
              right: 124,
              bottom: 16,
              gap: 2,
            }}
          >
            <T bold size={18} numberOfLines={1}>
              {p.name}
            </T>
            <T size={12} color={c.mint} numberOfLines={1}>
              {mediaStatus}
            </T>
          </View>
        </Card>
      ) : (
        <View
          style={{
            alignItems: "center",
            gap: 16,
            paddingVertical: 30,
            paddingHorizontal: 20,
            backgroundColor: c.surface,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: c.line,
          }}
        >
          {!ringing && mediaSessionId && auth.demoPhone && (
            <ZegoMedia
              sessionId={mediaSessionId}
              phone={auth.demoPhone}
              video={false}
              muted={muted}
              camera={false}
              front
              speaker={route === "Speaker"}
              onStatus={onMediaStatus}
              onError={onMediaError}
            />
          )}
          <View
            style={{
              padding: 16,
              borderRadius: 160,
              backgroundColor: c.successSurface,
            }}
          >
            <View
              style={{
                padding: 16,
                borderRadius: 140,
                backgroundColor: c.high,
              }}
            >
              <Avatar person={p} size={156} />
            </View>
          </View>
          <T size={24} bold>
            {p.name}
          </T>
          <T color={c.mint}>
            {ringing
              ? `${video ? "Video" : "Audio"} call · ${state.toLowerCase()}`
              : muted
                ? "Your microphone is muted"
                : state === "Connected"
                  ? mediaStatus
                  : state}
          </T>
        </View>
      )}
      {!ringing && <Wave large />}
      {soundError ? <Notice error>{soundError}</Notice> : null}
      {blocked || conflict ? (
        <Notice error>
          {blocked
            ? "This person is blocked. Unblock them from their profile before calling."
            : "You already have an ongoing call. Return to that call to end it first."}
        </Notice>
      ) : callError ? (
        <Notice error>{callError}</Notice>
      ) : p.status !== "Available" && outgoing ? (
        <Notice error>
          {p.name.split(" ")[0]} is {p.status.toLowerCase()}. You can send a
          message instead.
        </Notice>
      ) : null}
      {!ringing && (
        <>
          <T size={12} color={c.muted} style={{ textAlign: "center" }}>
            {mediaStatus === "Connected"
              ? "Secure media is connected."
              : mediaStatus}
          </T>
        </>
      )}
    </Shell>
  );
}
export function CallsList() {
  const d = useDemo();
  const [filter, setFilter] = useState("All");
  const [menuCall, setMenuCall] = useState<string | null>(null);
  const list = d.calls.filter(
    (x) =>
      filter === "All" ||
      x.type === filter.toLowerCase() ||
      x.status === filter ||
      (filter === "Incoming" && x.incoming) ||
      (filter === "Outgoing" && !x.incoming),
  );
  return (
    <Shell tab="Calls">
      <T size={24} bold>
        Your conversations
      </T>
      <T color={c.secondary}>A little history. A reason to reconnect.</T>
      <Chips
        items={["All", "Audio", "Video", "Missed", "Incoming", "Outgoing"]}
        selected={filter}
        onChange={setFilter}
      />
      <Section title="Recent calls" />
      {list.map((call) => {
        const person = personFor(call.person);
        return (
          <Card key={call.id} style={{ padding: 12, gap: 10 }}>
            <Row>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View ${person.name}'s call details`}
                onPress={() => go(`/calls/detail/${call.id}`)}
              >
                <Avatar person={person} size={46} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => go(`/calls/detail/${call.id}`)}
                style={{ flex: 1 }}
              >
                <T bold size={14}>
                  {person.name}
                </T>
                <T size={11} color={c.muted}>
                  {`${call.incoming ? "Incoming" : "Outgoing"} · ${call.status} · ${duration(call.seconds)}`}
                </T>
                {!call.incoming && (
                  <T mono size={10} color={c.warning}>
                    {call.chargedCoins ?? 0} coins spent
                  </T>
                )}
              </Pressable>
              <IconButton
                icon="phone"
                label={`Audio call ${person.name}`}
                onPress={() => go(`/calls/outgoing/${person.id}?type=audio`)}
              />
              <IconButton
                icon="video"
                label={`Video call ${person.name}`}
                onPress={() => go(`/calls/outgoing/${person.id}?type=video`)}
              />
              <IconButton
                icon="more-vertical"
                label={`More actions for ${person.name}`}
                active={menuCall === call.id}
                onPress={() =>
                  setMenuCall((v) => (v === call.id ? null : call.id))
                }
              />
            </Row>
            {menuCall === call.id && (
              <Row>
                <Button
                  title="Chat"
                  icon="message-circle"
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => go(`/chat/${person.id}`)}
                />
                <Button
                  title="Report"
                  icon="flag"
                  variant="danger"
                  style={{ flex: 1 }}
                  onPress={() => go(`/report/${person.id}`)}
                />
              </Row>
            )}
          </Card>
        );
      })}
      {!list.length && (
        <Empty
          icon="phone"
          title="No calls here yet"
          message="A hello could be the start of something good."
          action="Explore people"
          onPress={() => go("/explore")}
        />
      )}
    </Shell>
  );
}
export function CallDetail({
  id,
  result,
  status,
}: {
  id: string;
  result?: boolean;
  status?: string;
}) {
  const d = useDemo();
  const auth = useAuth();
  const call =
    d.calls.find((x) => x.id === id) ||
    d.calls.find((x) => x.person === id) ||
    d.calls[0];
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof fetchPhoneCallSummary>
  > | null>(null);
  const p = personFor(call.person);
  const sessionId = /^[0-9a-f-]{36}$/.test(call.id) ? call.id : "";
  useEffect(() => {
    if (!sessionId || !auth.demoPhone) return;
    let active = true;
    void fetchPhoneCallSummary(sessionId, auth.demoPhone)
      .then((value) => {
        if (active) setSummary(value);
      })
      .catch((error) => console.error("Failed to load call summary:", error));
    if (!call.incoming) {
      void d.refreshWalletBalance().catch((error) =>
        console.error("Failed to refresh the caller wallet for the receipt:", error),
      );
    }
    return () => {
      active = false;
    };
  }, [auth.demoPhone, call.incoming, d.refreshWalletBalance, sessionId]);
  const displaySeconds = summary?.duration_seconds ?? call.seconds;
  const displayCoins = summary?.coins_charged ?? call.chargedCoins;
  const displayStatus = summary?.status ?? status ?? call.status;
  const canCallAgain =
    d.profile.gender === "Male" && d.hostStatus !== "approved";
  return (
    <Shell title={result ? "Call summary" : "Call details"}>
      <View style={{ alignItems: "center", gap: 12, padding: 14 }}>
        <Avatar person={p} size={84} />
        <T size={23} bold>
          {result ? `Call ${displayStatus.toLowerCase()}` : p.name}
        </T>
        <T color={c.secondary}>
          {p.name} · {call.type} call
        </T>
        <Badge text={displayStatus} />
      </View>
      <Card>
        <Setting
          title="Duration"
          detail={duration(displaySeconds)}
          icon="clock"
        />
        {d.paid && !call.incoming && (
          <Setting
            title="Amount"
            detail={
              summary
                ? `${displayCoins ?? 0} coins spent`
                : displaySeconds
                  ? "Loading server receipt…"
                  : "0 coins · not connected"
            }
            icon="credit-card"
          />
        )}
        {d.paid && !call.incoming && (
          <Setting
            title="Available coins"
            detail={coins(d.balance)}
            icon="credit-card"
          />
        )}
        <T mono size={11} color={c.muted}>
          Reference {call.id}
        </T>
      </Card>
      <Button
        title="Send a message"
        icon="message-circle"
        onPress={() => go(`/chat/${p.id}`)}
      />
      {canCallAgain && (
        <Button
          title="Call again"
          variant="secondary"
          icon="phone"
          onPress={() => go(`/calls/outgoing/${p.id}?type=${call.type}`)}
        />
      )}
      <Button
        title="Report a problem"
        variant="secondary"
        onPress={() => go(`/report/${p.id}`)}
      />
      {d.later && (
        <Button
          title="Rate call"
          variant="secondary"
          onPress={() => go(`/rate/${p.id}`)}
        />
      )}
      <Button
        title="Back to calls"
        variant="secondary"
        onPress={() => router.replace("/calls" as never)}
      />
    </Shell>
  );
}
