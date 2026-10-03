import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export type PushPreferences = {
  calls: boolean;
  messages: boolean;
  wallet: boolean;
};

const tokenStorageKey = "aasai-expo-push-token";

function notificationsModule() {
  return require("expo-notifications") as typeof import("expo-notifications");
}

async function requestPushAction(idToken: string, action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(`${supabaseUrl}/functions/v1/push-notifications`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Push notification setup failed (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

export async function registerPushDevice(idToken: string, preferences: PushPreferences) {
  if (Platform.OS === "web") return null;
  const Notifications = notificationsModule();
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("calls", {
      name: "Incoming calls",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#e23744",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages and wallet",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || !projectId)
    throw new Error("Push notifications need this app to be linked to an EAS project.");

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await requestPushAction(idToken, "register", {
    expo_push_token: expoPushToken,
    platform: Platform.OS,
    preferences,
  });
  await SecureStore.setItemAsync(tokenStorageKey, expoPushToken);
  return expoPushToken;
}

export async function updatePushPreferences(idToken: string, preferences: PushPreferences) {
  if (Platform.OS === "web") return;
  await requestPushAction(idToken, "preferences", { preferences });
}

export async function unregisterPushDevice(idToken: string) {
  if (Platform.OS === "web") return;
  const expoPushToken = await SecureStore.getItemAsync(tokenStorageKey);
  if (!expoPushToken) return;
  await requestPushAction(idToken, "unregister", { expo_push_token: expoPushToken });
  await SecureStore.deleteItemAsync(tokenStorageKey);
}

export async function sendPushEvent(
  idToken: string,
  event: "incoming_call" | "message" | "wallet",
  eventId: string,
  source?: "call" | "message",
) {
  await requestPushAction(idToken, "send", { event, event_id: eventId, ...(source ? { source } : {}) });
}

/** A local device check confirms permission, channel setup, presentation, and routing. */
export async function showPushTestNotification(kind: "call" | "message" | "missed" | "safety") {
  if (Platform.OS === "web") throw new Error("Notification checks are available in the mobile app.");
  const Notifications = notificationsModule();
  const content = {
    call: { title: "Incoming call", body: "A caller is trying to reach you.", route: "/calls" },
    message: { title: "New message", body: "You have a new conversation waiting.", route: "/notifications" },
    missed: { title: "Missed call", body: "You can view the call details in Calls.", route: "/calls" },
    safety: { title: "Safety update", body: "Your report has been received for review.", route: "/notifications" },
  }[kind];
  await Notifications.scheduleNotificationAsync({
    content: { ...content, sound: "default", data: { route: content.route, type: "test" } },
    trigger: null,
  });
}
