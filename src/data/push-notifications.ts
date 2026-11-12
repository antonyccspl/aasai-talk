import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export type PushPreferences = {
  calls: boolean;
  messages: boolean;
  wallet: boolean;
  announcements: boolean;
};

const tokenStorageKey = "aasai-expo-push-token";

function iosNeedsHomeScreenInstall() {
  const isIOS =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isInstalled =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return isIOS && !isInstalled;
}

function notificationsModule() {
  return require("expo-notifications") as typeof import("expo-notifications");
}

async function requestPushAction(idToken: string, action: string, payload: Record<string, unknown> = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/push-notifications`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
    signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
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

export function requestBrowserCallPushPermission() {
  if (Platform.OS !== "web")
    return Promise.reject(new Error("Browser call alerts are only available on the web."));
  if (iosNeedsHomeScreenInstall())
    return Promise.reject(new Error("On iPhone or iPad, first add Aasai Talk to your Home Screen, open it from the new icon, and enable alerts there. Safari tabs cannot receive background call alerts."));
  if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window))
    return Promise.reject(new Error("This browser does not support background call alerts."));
  if (!("Notification" in window))
    return Promise.reject(new Error("This browser does not support notifications."));
  if (Notification.permission === "granted") return Promise.resolve();
  if (Notification.permission === "denied")
    return Promise.reject(new Error("Notifications are blocked for this site. Allow them in your browser settings, then try again."));
  return Notification.requestPermission().then((permission) => {
    if (permission !== "granted")
      throw new Error("Allow notifications to receive call alerts while the browser is minimized.");
  });
}

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export async function registerBrowserCallPush(idToken: string) {
  if (Platform.OS !== "web")
    throw new Error("Browser call alerts are only available on the web.");
  if (iosNeedsHomeScreenInstall())
    throw new Error("On iPhone or iPad, first add Aasai Talk to your Home Screen, open it from the new icon, and enable alerts there. Safari tabs cannot receive background call alerts.");
  const result = await requestPushAction(idToken, "web_vapid_key");
  if (!result || typeof result !== "object" || !("public_key" in result) || typeof result.public_key !== "string")
    throw new Error("Background call alerts are not configured yet.");

  const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(result.public_key),
    });
  }
  await requestPushAction(idToken, "register_web", {
    subscription: subscription.toJSON(),
  });
}

export async function sendBrowserCallPushTest(idToken: string) {
  const result = await requestPushAction(idToken, "test_web");
  if (!result || typeof result !== "object" || !("sent" in result) || result.sent !== true)
    throw new Error("The browser test alert was not accepted.");
}

export async function unregisterBrowserCallPush(idToken: string) {
  if (
    Platform.OS !== "web"
    || !("serviceWorker" in navigator)
    || !("PushManager" in window)
  ) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await requestPushAction(idToken, "unregister_web", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}

export async function updatePushPreferences(idToken: string, preferences: PushPreferences) {
  await requestPushAction(idToken, "preferences", { preferences });
}

export async function fetchPushPreferences(idToken: string): Promise<PushPreferences> {
  const result = await requestPushAction(idToken, "get_preferences");
  if (!result || typeof result !== "object" || !("preferences" in result))
    throw new Error("The notification preferences could not be loaded.");
  const preferences = result.preferences;
  if (
    !preferences ||
    typeof preferences !== "object" ||
    !("calls" in preferences) ||
    !("messages" in preferences) ||
    !("wallet" in preferences) ||
    !("announcements" in preferences) ||
    typeof preferences.calls !== "boolean" ||
    typeof preferences.messages !== "boolean" ||
    typeof preferences.wallet !== "boolean" ||
    typeof preferences.announcements !== "boolean"
  )
    throw new Error("The server returned invalid notification preferences.");
  return {
    calls: preferences.calls,
    messages: preferences.messages,
    wallet: preferences.wallet,
    announcements: preferences.announcements,
  };
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
  const result = await requestPushAction(idToken, "send", { event, event_id: eventId, ...(source ? { source } : {}) });
  if (event === "incoming_call" && (!result || typeof result !== "object" || (!("received" in result) || result.received !== true) && (!("sent" in result) || typeof result.sent !== "number" || result.sent < 1)))
    throw new Error("This Host is unreachable. The call alert could not be delivered.");
}

/** A local device check confirms permission, channel setup, presentation, and routing. */
export async function showPushTestNotification(kind: "call" | "message" | "missed" | "safety") {
  if (Platform.OS === "web") throw new Error("Notification checks are available in the app.");
  const Notifications = notificationsModule();
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted)
    throw new Error("Allow notifications in your settings, then try the test again.");
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
