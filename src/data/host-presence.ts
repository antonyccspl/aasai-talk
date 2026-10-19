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

export async function sendPresenceHeartbeat(idToken: string) {
  const result = await requestHostPresence(idToken, { action: "heartbeat" });
  if (!result || typeof result !== "object")
    throw new Error("Online status could not be confirmed by the presence service.");
  if (
    !("member_type" in result) ||
    !("tracked" in result) ||
    typeof result.member_type !== "string" ||
    typeof result.tracked !== "boolean"
  )
    throw new Error("The online-status service needs to be updated. Please redeploy the host-presence function.");
  if (result.member_type === "female_member" && result.tracked === false)
    return;
  if (
    (result.member_type !== "male_user" && result.member_type !== "host") ||
    result.tracked !== true ||
    !("last_seen_at" in result) ||
    typeof result.last_seen_at !== "string"
  )
    throw new Error("The presence service did not record this account's online status.");
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
