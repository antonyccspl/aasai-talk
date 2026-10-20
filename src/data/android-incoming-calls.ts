import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { AppState, Platform } from "react-native";
import type * as ExpoNotifications from "expo-notifications";
import { fetchPhoneCallState, updatePhoneCall } from "./call-sessions";

const notificationTask = "aasai-android-incoming-call";
const callPayloadKey = (uuid: string) => `aasai-call-${uuid}`;
const callUuidPattern = /^[0-9a-f-]{36}$/i;
const phonePattern = /^\+91\d{10}$/;
const handledActions = new Set<string>();
const endedByApp = new Set<string>();

export type IncomingNativeCall = {
  sessionId: string;
  callerPhone: string;
  hostPhone: string;
  callerName: string;
  callType: "audio" | "video";
  route: string;
  expiresAt: string;
};

type CallKeepModule = typeof import("react-native-callkeep");

function callKeepModule(): CallKeepModule {
  return require("react-native-callkeep") as CallKeepModule;
}

function parseIncomingCall(value: unknown): IncomingNativeCall | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.sessionId !== "string" ||
    !callUuidPattern.test(data.sessionId) ||
    typeof data.callerPhone !== "string" ||
    !phonePattern.test(data.callerPhone) ||
    typeof data.hostPhone !== "string" ||
    !phonePattern.test(data.hostPhone) ||
    (data.callType !== "audio" && data.callType !== "video") ||
    typeof data.callerName !== "string" ||
    data.callerName.length > 80 ||
    typeof data.route !== "string" ||
    !/^\/calls\/incoming\/phone_[0-9]+\?/.test(data.route) ||
    typeof data.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(data.expiresAt))
  )
    return null;
  return {
    sessionId: data.sessionId,
    callerPhone: data.callerPhone,
    hostPhone: data.hostPhone,
    callerName: data.callerName,
    callType: data.callType,
    route: data.route,
    expiresAt: data.expiresAt,
  };
}

export async function setupAndroidCallUi() {
  if (Platform.OS !== "android")
    throw new Error("Native incoming calls are currently available on Android only.");
  const CallKeep = callKeepModule().default;
  const ready = await CallKeep.setup({
    ios: { appName: "Aasai Talk" },
    android: {
      alertTitle: "Enable Aasai Talk internet calls",
      alertDescription: "Add Aasai Talk as a calling account so Android can show app calls while you are away. This does not replace your Phone app or change regular SIM calls.",
      cancelButton: "Not now",
      okButton: "Continue",
      additionalPermissions: [],
      endCallsWhenReactNativeStops: true,
      foregroundService: {
        channelId: "aasai-active-call",
        channelName: "Aasai Talk calls",
        notificationTitle: "Aasai Talk call in progress",
        foregroundServiceType: 132,
      },
    },
  });
  if (!ready || !(await CallKeep.checkPhoneAccountEnabled()))
    throw new Error("Enable Aasai Talk in Android phone-account settings to receive calls.");
}

async function showIncomingCall(call: IncomingNativeCall) {
  if (AppState.currentState === "active") return;
  const CallKeep = callKeepModule().default;
  await setupAndroidCallUi();
  if (!(await CallKeep.checkPhoneAccountEnabled()))
    throw new Error("The Aasai Talk phone account is disabled.");
  await SecureStore.setItemAsync(
    callPayloadKey(call.sessionId),
    JSON.stringify(call),
  );
  CallKeep.displayIncomingCall(
    call.sessionId,
    call.callerPhone,
    call.callerName,
    "number",
    call.callType === "video",
  );
}

if (Platform.OS === "android") {
  const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
  const Notifications = require("expo-notifications") as typeof import("expo-notifications");

  TaskManager.defineTask<ExpoNotifications.NotificationTaskPayload>(
    notificationTask,
    async ({ data, error }) => {
      if (error) {
        console.error("Android incoming-call notification task failed:", error);
        return Notifications.BackgroundNotificationTaskResult.Failed;
      }
      if (!data || !("data" in data)) return Notifications.BackgroundNotificationTaskResult.NoData;
      let remoteData: unknown = data.data;
      if (
        remoteData &&
        typeof remoteData === "object" &&
        "dataString" in remoteData &&
        typeof remoteData.dataString === "string"
      ) {
        try {
          remoteData = JSON.parse(remoteData.dataString);
        } catch (parseError) {
          console.warn("Ignoring malformed incoming-call push data:", parseError);
          return Notifications.BackgroundNotificationTaskResult.NoData;
        }
      }
      if (
        !remoteData ||
        typeof remoteData !== "object" ||
        !("type" in remoteData) ||
        remoteData.type !== "incoming_call"
      )
        return Notifications.BackgroundNotificationTaskResult.NoData;

      const call = parseIncomingCall(remoteData);
      if (!call) {
        console.error("Ignoring invalid Android incoming-call payload.");
        return Notifications.BackgroundNotificationTaskResult.Failed;
      }
      if (Date.parse(call.expiresAt) <= Date.now())
        return Notifications.BackgroundNotificationTaskResult.NoData;
      try {
        const current = await fetchPhoneCallState(call.sessionId, call.hostPhone);
        if (current.status !== "ringing")
          return Notifications.BackgroundNotificationTaskResult.NoData;
        await showIncomingCall(call);
        return Notifications.BackgroundNotificationTaskResult.NewData;
      } catch (taskError) {
        console.error("Unable to present the Android incoming-call screen:", taskError);
        return Notifications.BackgroundNotificationTaskResult.Failed;
      }
    },
  );

  void Notifications.registerTaskAsync(notificationTask).catch((error) =>
    console.error("Unable to register Android incoming-call handler:", error),
  );
}

export function listenForAndroidCallActions({
  onAnswer,
  onEnd,
}: {
  onAnswer: (uuid: string) => void;
  onEnd: (uuid: string) => void;
}) {
  if (Platform.OS !== "android") return () => {};
  const CallKeep = callKeepModule().default;
  const dispatch = (action: "answer" | "end", uuid: string) => {
    if (endedByApp.delete(uuid)) return;
    const key = `${action}:${uuid}`;
    if (handledActions.has(key)) return;
    handledActions.add(key);
    if (action === "answer") onAnswer(uuid);
    else onEnd(uuid);
  };
  const answer = CallKeep.addEventListener("answerCall", ({ callUUID }) =>
    dispatch("answer", callUUID),
  );
  const end = CallKeep.addEventListener("endCall", ({ callUUID }) =>
    dispatch("end", callUUID),
  );
  let active = true;
  void CallKeep.getInitialEvents()
    .then((events) => {
      if (!active) return;
      for (const event of events) {
        if (event.name === "RNCallKeepPerformAnswerCallAction")
          dispatch("answer", event.data.callUUID);
        else if (event.name === "RNCallKeepPerformEndCallAction")
          dispatch("end", event.data.callUUID);
      }
      CallKeep.clearInitialEvents();
    })
    .catch((error) =>
      console.error("Unable to read initial Android call actions:", error),
    );
  return () => {
    active = false;
    answer.remove();
    end.remove();
  };
}

export async function handleAndroidCallAnswer(uuid: string) {
  if (!callUuidPattern.test(uuid)) return;
  const raw = await SecureStore.getItemAsync(callPayloadKey(uuid));
  let call: IncomingNativeCall | null = null;
  if (raw) {
    try {
      call = parseIncomingCall(JSON.parse(raw));
    } catch {
      call = null;
    }
  }
  if (!call) {
    callKeepModule().default.endCall(uuid);
    return;
  }
  router.replace(
    `${call.route}&autoAnswer=true` as never,
  );
}

export async function handleAndroidCallEnd(uuid: string, hostPhone: string) {
  if (!callUuidPattern.test(uuid)) return;
  if (endedByApp.delete(uuid)) return;
  const raw = await SecureStore.getItemAsync(callPayloadKey(uuid));
  if (raw) {
    try {
      const call = parseIncomingCall(JSON.parse(raw));
      if (call && call.hostPhone === hostPhone)
        await updatePhoneCall(call.sessionId, hostPhone, "rejected");
    } catch (error) {
      console.error("Unable to reject Android incoming call:", error);
    }
  }
  await SecureStore.deleteItemAsync(callPayloadKey(uuid));
}

export function setAndroidCallActive(uuid: string) {
  if (Platform.OS !== "android" || !callUuidPattern.test(uuid)) return;
  callKeepModule().default.setCurrentCallActive(uuid);
}

export function endAndroidCallUi(uuid: string) {
  if (Platform.OS !== "android" || !callUuidPattern.test(uuid)) return;
  endedByApp.add(uuid);
  callKeepModule().default.endCall(uuid);
  void SecureStore.deleteItemAsync(callPayloadKey(uuid));
}
