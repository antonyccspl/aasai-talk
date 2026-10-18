import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export type HostPresenceSettings = {
  acceptingCalls: boolean;
  showLastSeen: boolean;
};

async function requestHostPresence(
  idToken: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}/functions/v1/host-presence`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : `Unable to update Host presence (${response.status}).`;
    throw new Error(message);
  }
  return result;
}

export async function sendHostPresenceHeartbeat(idToken: string) {
  await requestHostPresence(idToken, { action: "heartbeat" });
}

export async function fetchHostPresenceSettings(
  idToken: string,
): Promise<HostPresenceSettings> {
  const result = await requestHostPresence(idToken, { action: "settings" });
  if (
    !result ||
    typeof result !== "object" ||
    !("accepting_calls" in result) ||
    typeof result.accepting_calls !== "boolean" ||
    !("show_last_seen" in result) ||
    typeof result.show_last_seen !== "boolean"
  )
    throw new Error("Invalid Host presence settings returned by the server.");
  return {
    acceptingCalls: result.accepting_calls,
    showLastSeen: result.show_last_seen,
  };
}

export async function setHostCallAvailability(
  idToken: string,
  acceptingCalls: boolean,
) {
  await requestHostPresence(idToken, {
    action: "availability",
    accepting_calls: acceptingCalls,
  });
}

export async function setHostLastSeenVisibility(
  idToken: string,
  showLastSeen: boolean,
) {
  await requestHostPresence(idToken, {
    action: "privacy",
    show_last_seen: showLastSeen,
  });
}
