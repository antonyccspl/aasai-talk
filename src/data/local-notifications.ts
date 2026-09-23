import { Alert, Platform } from "react-native";

export async function prepareMessageNotifications() {
  // Native notifications require rebuilding every development client. Until
  // that rollout is complete, the application uses the reliable in-app alert.
  return false;
}

export async function showIncomingMessageNotification(sender: string, text: string) {
  if (Platform.OS === "web") return;
  const body = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  Alert.alert("New message", body);
}
