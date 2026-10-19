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

export async function sendMemberPresenceHeartbeat(idToken: string) {
  await requestHostPresence(idToken, { action: "member-heartbeat" });
}

export async function fetchHostPresenceSettings(
  idToken: string,
): Promise<HostPresenceSettings> {
  const result = await requestHostPresence(idToken, { action: "settings" });
  const settings = presenceSettingsPayload(result);
  const acceptingCalls =
    settings.accepting_calls ?? settings.acceptingCalls;
  const showLastSeen = settings.show_last_seen ?? settings.showLastSeen;
  if (typeof acceptingCalls !== "boolean" || typeof showLastSeen !== "boolean")
    throw new Error("Unable to load your call availability. Please try again.");
  return {
    acceptingCalls,
    showLastSeen,
  };
}

export async function fetchHostCallAvailability(idToken: string): Promise<boolean> {
  const settings = presenceSettingsPayload(
    await requestHostPresence(idToken, { action: "settings" }),
  );
  const acceptingCalls =
    settings.accepting_calls ?? settings.acceptingCalls;
  if (typeof acceptingCalls !== "boolean")
    throw new Error("We could not load your call availability. Please try again.");
  return acceptingCalls;
}

function presenceSettingsPayload(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object")
    throw new Error("We could not load your call availability. Please try again.");
  const payload =
    "settings" in result && result.settings && typeof result.settings === "object"
      ? result.settings
      : result;
  if (!payload || typeof payload !== "object")
    throw new Error("We could not load your call availability. Please try again.");
  return payload as Record<string, unknown>;
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
