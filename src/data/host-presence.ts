import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export async function sendHostPresenceHeartbeat(idToken: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/host-presence`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (response.ok) return;
  const body: unknown = await response.json().catch(() => null);
  const message =
    body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "Unable to update Host presence.";
  throw new Error(message);
}