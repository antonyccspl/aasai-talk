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
import { duration, people, personFor, useDemo } from "./store";
import { colors as c } from "./theme";
import {
  startPhoneCall,
  updatePhoneCall,
  settlePhoneCall,
  chargePhoneCallMinute,
  subscribeToPhoneCall,
} from "@/data/call-sessions";
import { useAuth } from "@/data/auth";
import { ZegoMedia } from "./zego-media";
import { startCallSound, stopCallSound } from "@/data/call-sounds";

const callCoinCost = (seconds: number, type: "audio" | "video") =>
  seconds ? Math.ceil(seconds / 60) * (type === "video" ? 50 : 20) : 0;

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
    id, name: "Caller", status: "Available" as const, photo: undefined, color: c.mint,
    age: 0, gender: "", city: "", languages: [], interests: [], bio: "",
  };
  const video = mode === "video" || type === "video";
  const incoming = mode === "incoming";
  const connectedRoute = (mode === "audio" || mode === "video") && !!sessionId;
  const outgoing = mode === "outgoing" || ((mode === "audio" || mode === "video") && !connectedRoute);
  const [state, setState] = useState(
    incoming
      ? "Incoming"
      : outgoing
        ? "Ringing"
        : "Connected",
  );
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(true);
  const [front, setFront] = useState(true);
  const [route, setRoute] = useState(d.active?.speaker === undefined ? "Speaker" : d.active.speaker ? "Speaker" : "Earpiece");
  const soundKey = useRef(`call-sound-${Date.now()}-${Math.random()}`).current;
  const [soundError, setSoundError] = useState("");
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [callError, setCallError] = useState("");
  const [mediaStatus, setMediaStatus] = useState("Starting media…");
  const connectingRef = useRef(false);
  const actionRef = useRef(false);
  const closedRef = useRef(false);
  const [actionPending, setActionPending] = useState(false);
  const chargedMinuteRef = useRef(0);
  const chargingMinuteRef = useRef(false);
  const blocked = d.blocked.includes(id);
  const conflict = !!d.active && d.active.person !== id;
  const activeCallId = d.active?.id ?? "";
  const mediaSessionId = /^[0-9a-f-]{36}$/.test(activeCallId)
    ? activeCallId
    : "";
  const activePhone = auth.demoPhone;
  const setActiveCall = d.setActive;
  const incomingCall = d.active?.incoming;
  const onMediaStatus = useCallback((status: string) => setMediaStatus(status), []);
  const onMediaError = useCallback((message: string) => {
    setCallError(message);
    setMediaStatus("Media unavailable");
    if (mediaSessionId && activePhone) {
      void updatePhoneCall(mediaSessionId, activePhone, "ended")
        .then(() => incomingCall ? undefined : settlePhoneCall(mediaSessionId, activePhone))
        .catch((error) => console.error("Failed to close unavailable media call:", error));
    }
    setActiveCall((current) => {
      if (!current || current.id !== mediaSessionId) return current;
      return null;
    });
  }, [activePhone, setActiveCall, incomingCall, mediaSessionId]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", value => setForeground(value === "active"));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const shouldRing = foreground && !actionPending && !closedRef.current && !callError &&
      (incoming ? !!sessionId : outgoing && d.active?.status === "Ringing");
    let disposed = false;
    if (shouldRing) {
      setSoundError("");
      void startCallSound(soundKey, incoming, route === "Speaker").catch(error => {
        if (!disposed) setSoundError(error instanceof Error ? error.message : "Call sound is unavailable.");
      });
    } else void stopCallSound(soundKey);
    return () => { disposed = true; void stopCallSound(soundKey); };
  }, [foreground, incoming, outgoing, sessionId, d.active?.status, actionPending, callError, route, soundKey]);
  useEffect(() => {
    setState(incoming ? "Incoming" : outgoing ? "Ringing" : "Connected");
  }, [incoming, outgoing, sessionId]);
  useEffect(() => {
    if (mode !== "incoming" || state !== "Incoming" || actionPending || !foreground) return;
    Vibration.vibrate([0, 700, 500], true);
    return () => {
      Vibration.cancel();
    };
  }, [mode, state, actionPending, foreground]);
  useEffect(() => {
    if (d.active?.person === id && !incoming)
      d.setActive((x) => (x ? { ...x, status: state } : x));
  }, [state, incoming, d.active?.person, id]);
  useEffect(() => {
    if (incoming || state !== "Connected" || !mediaSessionId || !activePhone) return;
    const timer = setInterval(() => {
      const completedMinute = Math.floor((d.active?.seconds ?? 0) / 60);
      if (completedMinute <= chargedMinuteRef.current || chargingMinuteRef.current) return;
      const nextMinute = chargedMinuteRef.current + 1;
      chargingMinuteRef.current = true;
      void chargePhoneCallMinute(mediaSessionId, activePhone, nextMinute)
        .then((result) => {
          if (result.charged && !result.responseInvalid) {
            chargedMinuteRef.current = nextMinute;
            if (typeof result.remaining_coins === "number" && result.remaining_coins >= 0)
              d.setBalance(result.remaining_coins);
          } else if (!result.responseInvalid && result.insufficient_balance) {
            void end("Ended");
          }
        })
        .catch((error) => {
          console.error("Failed to charge completed call minute:", error);
        })
        .finally(() => {
          chargingMinuteRef.current = false;
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [activePhone, d.active?.seconds, incoming, mediaSessionId, state]);
  async function end(status = "Ended") {
    if (closedRef.current) return;
    closedRef.current = true;
    Vibration.cancel();
    await stopCallSound(soundKey);
    setActionPending(true);
    const activeSessionId =
      sessionId || (d.active && /^[0-9a-f-]{36}$/.test(d.active.id) ? d.active.id : "");
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
          const settlement = await settlePhoneCall(activeSessionId, auth.demoPhone);
          settledCharge = settlement.coins_charged;
        }
      } catch (error) {
        console.error("Failed to close and settle call:", error);
      }
    }
    if (d.active)
      d.finishCall(status, settledCharge);
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
  async function connect() {
    if (blocked || conflict || actionRef.current || closedRef.current) return;
    setCallError("");
    if (d.active && !incoming) return;
    if (!incoming && d.paid && d.hostStatus !== "approved" && d.balance < (video ? 50 : 20))
      return go("/wallet/low-balance");
    if (!auth.demoPhone || !id.startsWith("phone_"))
      return go("/status/unavailable");
    const hostPhone = `+${id.slice("phone_".length)}`;
    let session;
    actionRef.current = true;
    setActionPending(true);
    try {
      if (incoming && sessionId) {
        await stopCallSound(soundKey);
        await updatePhoneCall(sessionId, auth.demoPhone, "connected");
        session = {
          id: sessionId,
          roomId: "",
          status: "connected" as const,
          callType: video ? "video" as const : "audio" as const,
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
      await updatePhoneCall(session.id, auth.demoPhone, "cancelled").catch(console.warn);
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
      sessionId || (d.active && /^[0-9a-f-]{36}$/.test(d.active.id) ? d.active.id : "");
    if (!activeId || !auth.demoPhone) return;
    return subscribeToPhoneCall(activeId, auth.demoPhone, async (status) => {
      if (status === "connected" && outgoing) {
        await stopCallSound(soundKey);
        if (closedRef.current) return;
        d.setActive((current) => (current ? { ...current, status: "Connected" } : current));
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
      title={
        incoming
          ? "Incoming call"
          : video
            ? "Video call"
            : "Audio call"
      }
      immersive
      skipSkeleton
      footer={
        ringing ? (
          incoming ? (
            <Row>
              <Button title="Decline" icon="phone-off" variant="danger"
                disabled={actionPending} style={{ flex: 1 }} onPress={() => end("Rejected")} />
              <Button title={actionPending ? "Connecting…" : "Accept"} icon={video ? "video" : "phone"}
                disabled={blocked || conflict || actionPending || closedRef.current}
                style={{ flex: 1 }} onPress={connect} />
            </Row>
          ) : (
            <View style={{ gap: 10 }}>
              <Button title={route === "Speaker" ? "Speaker on" : "Speaker off"}
                icon={route === "Speaker" ? "volume-2" : "headphones"} variant="secondary"
                onPress={() => {
                  const next = route !== "Speaker";
                  setRoute(next ? "Speaker" : "Earpiece");
                  d.setActive(current => current ? { ...current, speaker: next } : current);
                }} />
              {callError && !d.active && <Button title="Try again" disabled={actionPending} onPress={connect} />}
              <Button title="Cancel call" icon="phone-off" variant="danger" onPress={() => end("Cancelled")} />
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
                label={video ? "Toggle camera" : "Open chat"}
                icon={
                  video ? (camera ? "video" : "video-off") : "message-circle"
                }
                onPress={() => (video ? setCamera(!camera) : go(`/chat/${id}`))}
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
              <T size={11}>{video ? "Camera" : "Chat"}</T>
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
        text={ringing ? state : duration(d.active?.seconds || 0)}
        warning={state !== "Connected" && !ringing}
      />
    </Row>
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
              <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 30 }}>
                <View style={{ padding: 8, borderRadius: 99, backgroundColor: c.successSurface }}>
                  <Avatar person={p} size={86} />
                </View>
                <T bold size={21}>{p.name}</T>
                <T size={13} color={c.secondary} style={{ textAlign: "center" }}>
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
          <View style={{ backgroundColor: "rgba(8,13,11,0.74)", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Row style={{ gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 99, backgroundColor: c.mint }} />
              <T mono size={10} color={c.mint} bold>LIVE</T>
            </Row>
          </View>
          <View style={{ backgroundColor: "rgba(8,13,11,0.74)", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }}>
            <T mono size={10} color={c.text}>{duration(d.active?.seconds || 0)}</T>
          </View>
        </View>
        <View style={{ position: "absolute", zIndex: 3, left: 16, right: 124, bottom: 16, gap: 2 }}>
          <T bold size={18} numberOfLines={1}>{p.name}</T>
          <T size={12} color={c.mint} numberOfLines={1}>{mediaStatus}</T>
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
          {d.paid && (
            <T mono size={11} color={c.muted}>
              {d.callSlabs.find((row) => row.call_type === (video ? "VIDEO" : "AUDIO"))
                ?.diamonds_per_minute ?? "—"} diamonds per minute
            </T>
          )}
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
                <T mono size={10} color={c.warning}>
                  {(call.chargedCoins ?? callCoinCost(call.seconds, call.type))} coins spent
                </T>
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
  const call =
    d.calls.find((x) => x.id === id) ||
    d.calls.find((x) => x.person === id) ||
    d.calls[0];
  const p = personFor(call.person);
  const canCallAgain = d.profile.gender === "Male" && d.hostStatus !== "approved";
  return (
    <Shell title={result ? "Call summary" : "Call details"}>
      <View style={{ alignItems: "center", gap: 12, padding: 14 }}>
        <Avatar person={p} size={84} />
        <T size={23} bold>
          {result ? `Call ${(status || call.status).toLowerCase()}` : p.name}
        </T>
        <T color={c.secondary}>
          {p.name} · {call.type} call
        </T>
        <Badge text={status || call.status} />
      </View>
      <Card>
        <Setting
          title="Duration"
          detail={duration(call.seconds)}
          icon="clock"
        />
        {d.paid && (
          <Setting
            title="Amount"
            detail={
              call.seconds
                ? `${call.chargedCoins ?? callCoinCost(call.seconds, call.type)} coins spent`
                : "0 coins · not connected"
            }
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
